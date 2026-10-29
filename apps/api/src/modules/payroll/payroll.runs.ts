import type { CreateRunBody, RejectRunBody } from '@erp/contracts/payroll';
import { writeAudit } from '@erp/audit';
import {
  bdtTotal,
  dec,
  formatNumber,
  nextCounterValue,
  prisma,
  REPORTING_CURRENCY,
  toMoneyString,
  type Currency,
  type Money,
  type Prisma,
  type Tx,
} from '@erp/db';
import { emit } from '@erp/events';
import { notify } from '@erp/notifications';
import { AppError } from '@erp/utils';
import { getPayrollMonthlySummary } from '../attendance/attendance.summary.js';
import { monthRange } from '../attendance/attendance.range.js';
import { officeToday } from '../attendance/attendance.time.js';
import { sweepRecoveriesCollected } from '../asset/asset.sweep.js';
import { resolveRateOrThrow } from '../exchange/exchange.fx.js';
import { reimburseClaims } from '../expense/expense.decisions.js';
import { computePayslip } from './payroll.calc.js';
import { lockRun } from './payroll.lock.js';
import { loadPayrollSettings } from './payroll.settings.js';
import {
  assertProcessable,
  loadPayrollRoster,
  preflight,
  toComponentInputs,
} from './payroll.preflight.js';

const isUniqueViolation = (err: unknown): boolean =>
  (err as Prisma.PrismaClientKnownRequestError)?.code === 'P2002';

const monthLabel = (month: number, year: number) => `${year}-${String(month).padStart(2, '0')}`;

function runConflict(month: number, year: number): AppError {
  return new AppError(409, `A payroll run for ${monthLabel(month, year)} already exists`);
}

export async function listRuns() {
  const runs = await prisma.payrollRun.findMany({
    where: { deletedAt: null },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  const totals = await prisma.payslip.groupBy({
    by: ['payrollRunId'],
    _sum: { grossPayBdt: true, totalDeductionsBdt: true, netPayBdt: true, netPayableBdt: true },
    _count: { _all: true },
  });
  const totalsByRun = new Map(totals.map((t) => [t.payrollRunId, t]));

  return runs.map((run) => {
    const t = totalsByRun.get(run.id);
    return {
      ...run,
      payslipCount: t?._count._all ?? 0,
      grossPayBdt: t?._sum.grossPayBdt ?? dec(0),
      totalDeductionsBdt: t?._sum.totalDeductionsBdt ?? dec(0),
      netPayBdt: t?._sum.netPayBdt ?? dec(0),
      netPayableBdt: t?._sum.netPayableBdt ?? dec(0),
    };
  });
}

export async function getRun(id: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: {
      payslips: {
        include: { employee: { select: { id: true, fullName: true, employeeCode: true } } },
        orderBy: { employee: { fullName: 'asc' } },
      },
    },
  });
  if (!run || run.deletedAt) throw new AppError(404, 'Payroll run not found');
  // Names for the people left out, so the screen can list them and offer to
  // add them back without a second request.
  const excludedEmployees = run.excludedEmployeeIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: run.excludedEmployeeIds } },
        select: { id: true, fullName: true, employeeCode: true },
        orderBy: { fullName: 'asc' },
      })
    : [];
  return {
    ...run,
    excludedEmployees,
    preflight: await preflight(run.month, run.year, run.excludedEmployeeIds),
  };
}

export async function getRunPreflight(id: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    select: { month: true, year: true, deletedAt: true, excludedEmployeeIds: true },
  });
  if (!run || run.deletedAt) throw new AppError(404, 'Payroll run not found');
  return preflight(run.month, run.year, run.excludedEmployeeIds);
}

export async function createRun(actorUserId: string, body: CreateRunBody) {
  // A month that has not started yet has no attendance to process — this is
  // distinct from the current, still-in-progress month, which a run may be
  // drafted for early even though preflight will block processing it until
  // it ends.
  const requestedStart = new Date(Date.UTC(body.year, body.month - 1, 1));
  if (requestedStart.getTime() > officeToday().getTime()) {
    throw new AppError(400, `${monthLabel(body.month, body.year)} has not started yet`);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.create({
        data: {
          month: body.month,
          year: body.year,
          notes: body.notes,
        },
      });
      await writeAudit(tx, {
        entity: 'PAYROLL_RUN',
        entityId: run.id,
        action: 'CREATE',
        changedBy: actorUserId,
        after: { month: run.month, year: run.year, notes: run.notes },
      });
      return run;
    });
  } catch (err) {
    // The most important guard in this module: two runs for one month is a
    // double payment, not a data-quality problem.
    if (isUniqueViolation(err)) throw runConflict(body.month, body.year);
    throw err;
  }
}

function requireStatus(run: { status: string }, status: string, action: string): void {
  if (run.status !== status) {
    throw new AppError(
      409,
      `Cannot ${action} a run that is ${run.status.toLowerCase()} — this action is only legal from ${status}`,
    );
  }
}

/**
 * BDT per one unit of `currency`, converting an adjustment between two
 * currencies. Both are BDT or USD — the only pair this system has.
 */
function convertBetween(
  amount: Money,
  from: Currency,
  to: Currency,
  usdToBdt: Money | null,
): Money {
  if (from === to) return amount;
  if (!usdToBdt) {
    throw new Error(
      `Cannot convert ${from} to ${to} without a resolved USD rate — preflight should have blocked this`,
    );
  }
  return from === REPORTING_CURRENCY ? amount.dividedBy(usdToBdt) : amount.times(usdToBdt);
}

/**
 * Idempotent: deletes the run's payslips, releases every adjustment and
 * claim that pointed at them, and recomputes from scratch. Reprocessing is a
 * normal act — HR adds a missing bonus, a manager finally approves a stuck
 * record, someone fixes a rate. A clean rebuild is what stops a
 * half-processed run existing; restricting it to DRAFT is what stops an
 * approved run being rewritten under the approver.
 */
export async function processRun(id: string, actorUserId: string, excludedEmployeeIds?: string[]) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run || run.deletedAt) throw new AppError(404, 'Payroll run not found');
  requireStatus(run, 'DRAFT', 'process');
  // The people Finance left out. Sent with this request when they changed the
  // choice; otherwise the earlier choice stays.
  const leftOut = [...new Set(excludedEmployeeIds ?? run.excludedEmployeeIds ?? [])];

  // Everything that only reads, and does not depend on the delete below, runs
  // BEFORE the transaction starts, on the plain client. Inside the transaction
  // each of these reads needed a second connection while the transaction held
  // the first, from a pool of five. A few overlapping payroll actions could
  // use up the pool and wait on each other. It also kept the transaction open
  // for the whole attendance summary.
  //
  // These reads could never see the transaction's own uncommitted delete (the
  // plain client reads committed data), so moving them earlier changes what
  // they read in no way.
  //
  // `assertProcessable` is first, so a run that cannot legally be paid is
  // never partially rewritten. Same read-then-write pattern
  // `assertMonthNotLocked` uses elsewhere in this codebase.
  await assertProcessable(run.month, run.year, leftOut);

  const [rosterAll, summaries] = await Promise.all([
    loadPayrollRoster(run.month, run.year),
    // Attendance does not depend on payslips, so it is safe to read before the
    // delete.
    getPayrollMonthlySummary(run.month, run.year),
  ]);
  const roster = rosterAll
    .filter((e) => !leftOut.includes(e.id))
    .filter(
      (e): e is typeof e & { salaryStructure: NonNullable<(typeof e)['salaryStructure']> } =>
        e.salaryStructure !== null,
    );
  const rosterIds = roster.map((e) => e.id);
  const { to: monthEnd } = monthRange(run.year, run.month);

  // Resolve the run's rate once. USD is the only non-BDT currency this
  // system has, so "the rate per currency" collapses to "the USD rate" —
  // null when nobody in the roster is paid in it, since there is then no
  // "the rate" to speak of.
  const needsUsd = roster.some((e) => e.salaryStructure.currency !== REPORTING_CURRENCY);
  const usdRate = needsUsd ? await resolveRateOrThrow('USD', monthEnd) : null;
  const summaryByEmployee = new Map(summaries.map((s) => [s.employee.id, s]));

  return prisma.$transaction(async (tx) => {
    // Two people processing at once take turns: the second sees the first's payslips and rebuilds them.
    const locked = await lockRun(tx, id);
    requireStatus(locked, 'DRAFT', 'process');
    // Deleting the payslip rows is enough to release every PayrollAdjustment
    // and ExpenseClaim that pointed at them — both foreign keys are
    // ON DELETE SET NULL precisely so a reprocess does not have to remember
    // to clear them by hand. The reads for adjustments and claims below must
    // stay inside the transaction, after this delete, to see them released.
    await tx.payslip.deleteMany({ where: { payrollRunId: id } });

    // Read inside the transaction, so a run uses the rule that was in force
    // when it was processed. The payslip then freezes the result.
    const { deductLossOfPay, recoverAssetsFromSalary } = await loadPayrollSettings(tx);

    const unclaimedAdjustments =
      rosterIds.length === 0
        ? []
        : await tx.payrollAdjustment.findMany({
            where: {
              employeeId: { in: rosterIds },
              month: run.month,
              year: run.year,
              payslipId: null,
              // A recovery already waiting stays waiting, and untouched, while
              // the company does not take assets from salary.
              ...(recoverAssetsFromSalary ? {} : { NOT: { code: 'ASSET_RECOVERY' } }),
            },
          });
    // Only APPROVED claims with both payslipId and settlementId null, and
    // only for employees in this run. A claim already on a settlement must
    // never also be swept onto a payslip.
    const unsweptClaims =
      rosterIds.length === 0
        ? []
        : await tx.expenseClaim.findMany({
            where: {
              employeeId: { in: rosterIds },
              status: 'APPROVED',
              payslipId: null,
              settlementId: null,
            },
          });
    const claimsByEmployee = new Map<string, typeof unsweptClaims>();
    for (const claim of unsweptClaims) {
      const list = claimsByEmployee.get(claim.employeeId) ?? [];
      list.push(claim);
      claimsByEmployee.set(claim.employeeId, list);
    }

    const adjustmentsByEmployee = new Map<string, typeof unclaimedAdjustments>();
    for (const adjustment of unclaimedAdjustments) {
      const list = adjustmentsByEmployee.get(adjustment.employeeId) ?? [];
      list.push(adjustment);
      adjustmentsByEmployee.set(adjustment.employeeId, list);
    }

    const calendarDays = new Date(Date.UTC(run.year, run.month, 0)).getUTCDate();

    for (const employee of roster) {
      const structure = employee.salaryStructure;
      const summary = summaryByEmployee.get(employee.id);
      // Invariant, not user input: loadPayrollRoster's population is always
      // a subset of getMonthlySummary's (same ACTIVE/ON_LEAVE filter, plus a
      // joining-date restriction), so every roster member has a summary.
      if (!summary) {
        throw new Error(`No attendance summary for roster employee ${employee.id} — this is a bug`);
      }

      const rate = structure.currency === REPORTING_CURRENCY ? dec(1) : usdRate!;
      const adjustments = (adjustmentsByEmployee.get(employee.id) ?? []).map((a) => ({
        code: a.code,
        label: a.label,
        kind: a.kind,
        amount: convertBetween(dec(a.amount), a.currency, structure.currency, usdRate),
      }));

      // Each claim was already converted once, at approval, at its own
      // spend-date rate. Its BDT value is therefore fixed; only the final
      // hop into this payslip's currency remains.
      const employeeClaims = claimsByEmployee.get(employee.id) ?? [];
      const reimbursements = employeeClaims.map((claim) => {
        const claimRate = claim.fxRateToBdt ?? dec(1);
        const amountInBdt = dec(claim.amount).times(claimRate);
        return {
          claimId: claim.id,
          category: claim.categoryId,
          expenseDate: claim.expenseDate.toISOString().slice(0, 10),
          spentCurrency: claim.currency,
          spentAmount: dec(claim.amount),
          fxRateToBdt: claimRate,
          amount:
            structure.currency === REPORTING_CURRENCY
              ? amountInBdt
              : amountInBdt.dividedBy(usdRate!),
        };
      });

      const result = computePayslip({
        basic: dec(structure.basic),
        components: toComponentInputs(structure.components),
        adjustments,
        reimbursements,
        calendarDays,
        workingDays: summary.workingDays,
        present: summary.present,
        absent: summary.absent,
        onPaidLeave: summary.onPaidLeave,
        onUnpaidLeave: summary.onUnpaidLeave,
        deductLossOfPay,
      });

      const payslipNo = formatNumber('BS-PAY', await nextCounterValue(tx, 'PAY'));

      const payslip = await tx.payslip.create({
        data: {
          payslipNo,
          payrollRunId: id,
          employeeId: employee.id,
          calendarDays: result.calendarDays,
          lopDays: result.lopDays,
          payableDays: result.payableDays,
          currency: structure.currency,
          basic: result.basic,
          grossFull: result.grossFull,
          grossPay: result.grossPay,
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,
          reimbursements: result.reimbursements,
          netPayable: result.netPayable,
          fxRateToBdt: rate,
          grossPayBdt: bdtTotal(result.grossPay, rate),
          totalDeductionsBdt: bdtTotal(result.totalDeductions, rate),
          netPayBdt: bdtTotal(result.netPay, rate),
          netPayableBdt: bdtTotal(result.netPayable, rate),
          breakdown: {
            currency: structure.currency,
            fxRateToBdt: rate.toFixed(6),
            ...result.breakdown,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      const consumedIds = (adjustmentsByEmployee.get(employee.id) ?? []).map((a) => a.id);
      if (consumedIds.length > 0) {
        await tx.payrollAdjustment.updateMany({
          where: { id: { in: consumedIds } },
          data: { payslipId: payslip.id },
        });
      }
      if (employeeClaims.length > 0) {
        await tx.expenseClaim.updateMany({
          where: { id: { in: employeeClaims.map((c) => c.id) } },
          data: { payslipId: payslip.id },
        });
      }
    }

    const updated = await tx.payrollRun.update({
      where: { id },
      data: {
        fxRateToBdt: usdRate,
        processedBy: actorUserId,
        processedAt: new Date(),
        excludedEmployeeIds: leftOut,
      },
    });
    await writeAudit(tx, {
      entity: 'PAYROLL_RUN',
      entityId: id,
      action: 'PROCESS',
      changedBy: actorUserId,
      after: {
        payslipCount: roster.length,
        fxRateToBdt: usdRate?.toFixed(6) ?? null,
        leftOut: leftOut.length,
      },
    });
    return updated;
  });
}

/**
 * Soft delete, for a DRAFT run only. The row stays as a record and frees its
 * month, so Finance can open a new run for it. The payslips go, which gives
 * back every adjustment and expense claim they were holding (both links are
 * ON DELETE SET NULL), so the next run can use them. What the run held is
 * written to the audit log first.
 */
export async function deleteRun(id: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    if (run.status !== 'DRAFT') {
      throw new AppError(
        409,
        `Only a draft run can be deleted. This run is ${run.status.toLowerCase()}.`,
      );
    }
    const totals = await tx.payslip.aggregate({
      where: { payrollRunId: id },
      _count: { _all: true },
      _sum: { netPayableBdt: true },
    });
    await tx.payslip.deleteMany({ where: { payrollRunId: id } });
    const deleted = await tx.payrollRun.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
    await writeAudit(tx, {
      entity: 'PAYROLL_RUN',
      entityId: id,
      action: 'DELETE',
      changedBy: actorUserId,
      before: {
        month: run.month,
        year: run.year,
        status: run.status,
        payslipCount: totals._count._all,
        totalNetPayableBdt: toMoneyString(totals._sum.netPayableBdt ?? dec(0)),
        leftOut: run.excludedEmployeeIds.length,
      },
    });
    return deleted;
  });
}

/** Who is told a run needs a decision: every active admin and every active holder of `payroll.approve` at all, but not the person who asked. */
async function approverIds(tx: Tx, exceptUserId: string): Promise<string[]> {
  const users = await tx.user.findMany({
    where: {
      isActive: true,
      id: { not: exceptUserId },
      OR: [
        { accessLevel: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        {
          accessLevel: 'STANDARD',
          role: { permissions: { some: { permissionKey: 'payroll.approve', scope: 'ALL' } } },
        },
      ],
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/** The person who prepared a run may not also approve it, unless they are an administrator: nobody sits above that level. */
function assertNotOwnRun(
  run: { processedBy: string | null; submittedBy: string | null },
  actor: Actor,
): void {
  if (actor.isAdmin) return;
  if (run.processedBy === actor.userId || run.submittedBy === actor.userId) {
    throw new AppError(403, 'You prepared this run, so someone else must decide it');
  }
}

/** Who is acting: the user, and whether they hold an administrator level. */
export interface Actor {
  userId: string;
  isAdmin: boolean;
}

export async function submitRun(id: string, actorUserId: string) {
  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    requireStatus(run, 'DRAFT', 'submit');
    if (!run.processedAt) {
      throw new AppError(409, 'This run has not been processed yet — process it before submitting');
    }
    const row = await tx.payrollRun.update({
      where: { id },
      data: { status: 'SUBMITTED', submittedBy: actorUserId, submittedAt: new Date() },
    });
    await writeAudit(tx, {
      entity: 'PAYROLL_RUN',
      entityId: id,
      action: 'SUBMIT',
      changedBy: actorUserId,
    });
    await emit(tx, 'payroll.run.submitted', {
      runId: id,
      month: run.month,
      year: run.year,
      actorUserId,
    });
    await notify(
      tx,
      (await approverIds(tx, actorUserId)).map((userId) => ({
        userId,
        type: 'payroll.run.submitted',
        title: `${monthLabel(run.month, run.year)} payroll needs approval`,
        href: '/payroll',
        entity: 'PAYROLL_RUN',
        entityId: id,
      })),
    );
    return row;
  });
}

/** Approval is the moment a payslip becomes visible to the person it belongs to, and the moment to say so. */
export async function approveRun(id: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    requireStatus(run, 'SUBMITTED', 'approve');
    assertNotOwnRun(run, actor);
    const updated = await tx.payrollRun.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date() },
    });
    await writeAudit(tx, {
      entity: 'PAYROLL_RUN',
      entityId: id,
      action: 'APPROVE',
      changedBy: actor.userId,
    });

    const payslips = await tx.payslip.findMany({
      where: { payrollRunId: id },
      select: {
        id: true,
        employeeId: true,
        currency: true,
        grossPay: true,
        totalDeductions: true,
        netPay: true,
        reimbursements: true,
        netPayable: true,
        fxRateToBdt: true,
        grossPayBdt: true,
        totalDeductionsBdt: true,
        netPayBdt: true,
        netPayableBdt: true,
        employee: { select: { userId: true, departmentId: true } },
      },
    });
    // The figures a bookkeeper needs, with no ledger written here: accounting is outside this system.
    await emit(tx, 'payroll.run.finalized', {
      runId: id,
      month: run.month,
      year: run.year,
      payslipCount: payslips.length,
      grossPayBdt: toMoneyString(sumOf(payslips.map((p) => p.grossPayBdt))),
      totalDeductionsBdt: toMoneyString(sumOf(payslips.map((p) => p.totalDeductionsBdt))),
      netPayBdt: toMoneyString(sumOf(payslips.map((p) => p.netPayBdt))),
      reimbursementsBdt: toMoneyString(
        sumOf(payslips.map((p) => bdtTotal(p.reimbursements, p.fxRateToBdt))),
      ),
      netPayableBdt: toMoneyString(sumOf(payslips.map((p) => p.netPayableBdt))),
      lines: payslips.map((p) => ({
        payslipId: p.id,
        employeeId: p.employeeId,
        departmentId: p.employee.departmentId,
        currency: p.currency,
        netPayableBdt: toMoneyString(p.netPayableBdt),
      })),
      actorUserId: actor.userId,
    });
    for (const payslip of payslips) {
      await emit(tx, 'payslip.published', {
        payslipId: payslip.id,
        employeeId: payslip.employeeId,
        month: run.month,
        year: run.year,
        actorUserId: actor.userId,
      });
    }
    await notify(
      tx,
      payslips.map((p) => ({
        userId: p.employee.userId,
        type: 'payslip.published',
        title: `Your ${monthLabel(run.month, run.year)} payslip is ready`,
        href: '/me/payroll',
        entity: 'PAYSLIP',
        entityId: p.id,
      })),
    );
    return updated;
  });
}

const sumOf = (values: Money[]): Money => values.reduce((a, b) => a.plus(b), dec(0));

/**
 * Returns to DRAFT, not a terminal REJECTED: the month still has to be paid, and process is an idempotent
 * rebuild so the cause can be fixed and the run resubmitted.
 */
export async function rejectRun(id: string, actor: Actor, body: RejectRunBody) {
  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    requireStatus(run, 'SUBMITTED', 'reject');
    assertNotOwnRun(run, actor);
    const updated = await tx.payrollRun.update({
      where: { id },
      data: { status: 'DRAFT', rejectionNote: body.note },
    });
    await writeAudit(tx, {
      entity: 'PAYROLL_RUN',
      entityId: id,
      action: 'REJECT',
      changedBy: actor.userId,
      note: body.note,
    });
    await emit(tx, 'payroll.run.rejected', {
      runId: id,
      month: run.month,
      year: run.year,
      note: body.note,
      actorUserId: actor.userId,
    });
    return updated;
  });
}

/** Terminal: there is no un-disburse. */
export async function disburseRun(id: string, actorUserId: string) {
  const peek = await prisma.payrollRun.findUnique({ where: { id } });
  if (!peek || peek.deletedAt) throw new AppError(404, 'Payroll run not found');
  // Reported, not posted: there is no ledger for an FX gain or loss to go to. Only meaningful when the run used a foreign rate.
  const disbursementFxRateToBdt = peek.fxRateToBdt
    ? await resolveRateOrThrow('USD', officeToday())
    : null;

  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    requireStatus(run, 'APPROVED', 'disburse');
    const updated = await tx.payrollRun.update({
      where: { id },
      data: {
        status: 'DISBURSED',
        disbursedBy: actorUserId,
        disbursedAt: new Date(),
        disbursementFxRateToBdt,
      },
    });
    // The claims this run's own payslips consumed are paid now; recoveries collected through its adjustments too.
    const claims = await tx.expenseClaim.findMany({
      where: { payslip: { payrollRunId: id }, status: 'APPROVED' },
      select: { id: true, payslipId: true },
    });
    const byPayslip = new Map<string, string[]>();
    for (const claim of claims) {
      byPayslip.set(claim.payslipId!, [...(byPayslip.get(claim.payslipId!) ?? []), claim.id]);
    }
    for (const [payslipId, claimIds] of byPayslip) {
      await reimburseClaims(tx, claimIds, { payslipId, actorUserId });
    }
    await sweepRecoveriesCollected(
      tx,
      { status: 'PENDING', adjustment: { payslip: { payrollRunId: id } } },
      actorUserId,
    );
    await writeAudit(tx, {
      entity: 'PAYROLL_RUN',
      entityId: id,
      action: 'DISBURSE',
      changedBy: actorUserId,
      after: { disbursementFxRateToBdt: disbursementFxRateToBdt?.toFixed(6) ?? null },
    });
    await emit(tx, 'payroll.run.disbursed', {
      runId: id,
      month: run.month,
      year: run.year,
      disbursementFxRateToBdt: disbursementFxRateToBdt?.toFixed(6) ?? null,
      actorUserId,
    });
    return updated;
  });
}
