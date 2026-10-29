import type { OverrideSettlementBody, SettlementRejectBody } from '@erp/contracts/settlement';
import { writeAudit } from '@erp/audit';
import {
  bdtTotal,
  dec,
  formatNumber,
  nextCounterValue,
  prisma,
  REPORTING_CURRENCY,
  toMoneyString,
  type Prisma,
} from '@erp/db';
import { emit } from '@erp/events';
import { renderEmail, sendMail } from '@erp/mail';
import { AppError } from '@erp/utils';
import { env } from '../../env.js';
import { sweepRecoveriesCollected } from '../asset/asset.sweep.js';
import { getPayrollMonthlySummary } from '../attendance/attendance.summary.js';
import { monthRange } from '../attendance/attendance.range.js';
import { resolveRateOrThrow } from '../exchange/exchange.fx.js';
import { reimburseClaims } from '../expense/expense.decisions.js';
import { toComponentInputs } from '../payroll/payroll.preflight.js';
import { loadPayrollSettings } from '../payroll/payroll.settings.js';
import {
  completedServiceYears,
  computeGratuity,
  computeNoticePay,
  computePendingSalary,
  finalAmount,
  serviceYears,
  wagesBase,
} from './settlement.calc.js';
import { lockSettlement } from './settlement.lock.js';
import { EXIT_POLICIES } from './settlement.policy.js';

const SETTLEMENT_INCLUDE = {
  employee: {
    select: { id: true, fullName: true, employeeCode: true, joiningDate: true },
  },
  claims: { select: { id: true, categoryId: true, amount: true, currency: true } },
} as const;

/**
 * Finance may replace a computed head with a reason while the settlement is
 * DRAFT. A payroll system that silently arbitrated a §23 dispute would be
 * worse than one that shows its working and lets a human overrule it.
 */
export async function overrideSettlement(
  id: string,
  actorUserId: string,
  body: OverrideSettlementBody,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await lockSettlement(tx, id);
    if (existing.status !== 'DRAFT') {
      throw new AppError(409, `This settlement is already ${existing.status.toLowerCase()}`);
    }

    const next = {
      pendingSalary:
        body.pendingSalary !== undefined ? dec(body.pendingSalary) : existing.pendingSalary,
      gratuity: body.gratuity !== undefined ? dec(body.gratuity) : existing.gratuity,
      noticePay: body.noticePay !== undefined ? dec(body.noticePay) : existing.noticePay,
      expenseReimbursement:
        body.expenseReimbursement !== undefined
          ? dec(body.expenseReimbursement)
          : existing.expenseReimbursement,
      leaveEncashment: existing.leaveEncashment,
      outstandingDeductions:
        body.outstandingDeductions !== undefined
          ? dec(body.outstandingDeductions)
          : existing.outstandingDeductions,
      assetRecoveries:
        body.assetRecoveries !== undefined ? dec(body.assetRecoveries) : existing.assetRecoveries,
    };
    const total = finalAmount(next);

    const updated = await tx.settlement.update({
      where: { id },
      data: {
        ...next,
        finalAmount: total,
        finalAmountBdt: bdtTotal(total, existing.fxRateToBdt),
      },
      include: SETTLEMENT_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'SETTLEMENT',
      entityId: id,
      action: 'UPDATE',
      changedBy: actorUserId,
      before: {
        pendingSalary: toMoneyString(existing.pendingSalary),
        gratuity: toMoneyString(existing.gratuity),
        noticePay: toMoneyString(existing.noticePay),
        outstandingDeductions: toMoneyString(existing.outstandingDeductions),
        assetRecoveries: toMoneyString(existing.assetRecoveries),
        finalAmount: toMoneyString(existing.finalAmount),
      },
      after: {
        pendingSalary: toMoneyString(next.pendingSalary),
        gratuity: toMoneyString(next.gratuity),
        noticePay: toMoneyString(next.noticePay),
        outstandingDeductions: toMoneyString(next.outstandingDeductions),
        assetRecoveries: toMoneyString(next.assetRecoveries),
        finalAmount: toMoneyString(total),
      },
      note: body.reason,
    });
    return updated;
  });
}

/**
 * An idempotent rebuild while DRAFT, exactly like `processRun`.
 *
 * Gated on the same attendance condition as a run: a leaver's final days are
 * the ones most likely to be left pending approval.
 */
export async function calculateSettlement(employeeId: string, actorUserId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { salaryStructure: { include: { components: true } } },
  });
  if (!employee) throw new AppError(404, 'Employee not found');

  if (!employee.lastWorkingDay || !employee.exitReason) {
    throw new AppError(
      409,
      'This employee has no exit details. Record a last working day and an exit reason before calculating a settlement.',
    );
  }
  if (!employee.salaryStructure) {
    throw new AppError(
      409,
      'This employee has no salary structure, so no settlement can be computed',
    );
  }

  const existing = await prisma.settlement.findFirst({
    where: { employeeId, status: { in: ['DRAFT', 'APPROVED'] } },
  });
  if (existing && existing.status !== 'DRAFT') {
    throw new AppError(
      409,
      `A settlement for this employee is already ${existing.status.toLowerCase()}`,
    );
  }

  const lastWorkingDay = employee.lastWorkingDay;
  const month = lastWorkingDay.getUTCMonth() + 1;
  const year = lastWorkingDay.getUTCFullYear();

  // The same gate a run applies. A leaver's final days are exactly the ones
  // most likely to be sitting unapproved.
  const summaries = await getPayrollMonthlySummary(month, year);
  const summary = summaries.find((s) => s.employee.id === employeeId);
  if (summary && summary.pendingApproval > 0) {
    throw new AppError(
      409,
      `${summary.pendingApproval} attendance day(s) in the exit month are still unapproved. Approve them before calculating.`,
    );
  }

  const structure = employee.salaryStructure;
  const currency = structure.currency;
  const fxRateToBdt =
    currency === REPORTING_CURRENCY ? dec(1) : await resolveRateOrThrow(currency, lastWorkingDay);

  const { to: monthEnd } = monthRange(year, month);
  const calendarDays = monthEnd.getUTCDate();
  const daysEmployed = lastWorkingDay.getUTCDate();

  const components = toComponentInputs(structure.components);
  const componentsWithFlags = structure.components.map((c) => ({
    ...toComponentInputs([c])[0]!,
    countsAsWages: c.countsAsWages,
  }));

  const { deductLossOfPay } = await loadPayrollSettings(prisma);
  const pending = computePendingSalary({
    basic: dec(structure.basic),
    components,
    calendarDays,
    daysEmployed,
    // Days after the last working day are still not paid. Only the attendance
    // part follows the company rule for loss of pay.
    lopDays: summary && deductLossOfPay ? summary.absent + summary.onUnpaidLeave : 0,
    workingDays: summary?.workingDays ?? 0,
    present: summary?.present ?? 0,
    onPaidLeave: summary?.onPaidLeave ?? 0,
  });

  const base = wagesBase(dec(structure.basic), componentsWithFlags);
  const completed = completedServiceYears(employee.joiningDate, lastWorkingDay);
  const years = serviceYears(employee.joiningDate, lastWorkingDay);
  const gratuity = computeGratuity(base, completed, employee.exitReason);
  // Notice served is not modelled as a field; the exit note records the
  // human circumstance, and Finance overrides the head if it was served.
  const notice = computeNoticePay(base, employee.exitReason, false);

  // Sweep approved claims not already taken by a payslip or settlement.
  const claims = await prisma.expenseClaim.findMany({
    where: { employeeId, status: 'APPROVED', payslipId: null, settlementId: null },
  });
  const expenseReimbursement = claims.reduce((total, claim) => {
    const inBdt = dec(claim.amount).times(claim.fxRateToBdt ?? dec(1));
    return total.plus(currency === REPORTING_CURRENCY ? inBdt : inBdt.dividedBy(fxRateToBdt));
  }, dec(0));

  const heads = {
    pendingSalary: pending.netPay,
    gratuity: gratuity.amount,
    noticePay: notice.amount,
    expenseReimbursement,
    // Always 0 this phase: encashing a derived earned-leave balance needs a
    // rule for freezing it at exit, which is out of scope.
    leaveEncashment: dec(0),
    outstandingDeductions: dec(0),
    assetRecoveries: dec(0),
  };
  const total = finalAmount(heads);

  const breakdown = {
    currency,
    fxRateToBdt: fxRateToBdt.toFixed(6),
    exitReason: employee.exitReason,
    exitLabel: EXIT_POLICIES[employee.exitReason].label,
    lastWorkingDay: lastWorkingDay.toISOString().slice(0, 10),
    serviceYears: years.toFixed(2),
    completedYears: completed,
    pendingSalary: {
      calendarDays,
      daysEmployed,
      payableDays: pending.payableDays.toFixed(2),
      grossPay: toMoneyString(pending.grossPay),
      totalDeductions: toMoneyString(pending.totalDeductions),
      netPay: toMoneyString(pending.netPay),
      lines: pending.breakdown,
    },
    gratuity: { ...gratuity, amount: toMoneyString(gratuity.amount) },
    notice: { ...notice, amount: toMoneyString(notice.amount) },
    claims: claims.map((c) => ({
      claimId: c.id,
      category: c.categoryId,
      spentCurrency: c.currency,
      spentAmount: toMoneyString(c.amount),
      fxRateToBdt: (c.fxRateToBdt ?? dec(1)).toFixed(6),
    })),
  };

  return prisma.$transaction(async (tx) => {
    // Two people calculating for one leaver take turns, so a rebuild never leaves two drafts.
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`;
    // Idempotent rebuild: drop the previous draft and release its claims,
    // exactly as processRun does for a run.
    if (existing) {
      await tx.expenseClaim.updateMany({
        where: { settlementId: existing.id },
        data: { settlementId: null },
      });
      await tx.settlement.delete({ where: { id: existing.id } });
    }

    const settlement = await tx.settlement.create({
      data: {
        settlementNo: formatNumber('BS-STL', await nextCounterValue(tx, 'STL')),
        employeeId,
        status: 'DRAFT',
        lastWorkingDay,
        exitReason: employee.exitReason!,
        serviceYears: years,
        currency,
        fxRateToBdt,
        ...heads,
        finalAmount: total,
        finalAmountBdt: bdtTotal(total, fxRateToBdt),
        breakdown: breakdown as unknown as Prisma.InputJsonValue,
        calculatedBy: actorUserId,
        calculatedAt: new Date(),
      },
      include: SETTLEMENT_INCLUDE,
    });

    if (claims.length > 0) {
      await tx.expenseClaim.updateMany({
        where: { id: { in: claims.map((c) => c.id) } },
        data: { settlementId: settlement.id },
      });
    }

    await writeAudit(tx, {
      entity: 'SETTLEMENT',
      entityId: settlement.id,
      action: 'CREATE',
      changedBy: actorUserId,
      after: { employeeId, finalAmount: toMoneyString(total), currency },
    });
    return settlement;
  });
}

export async function getSettlement(employeeId: string) {
  const settlement = await prisma.settlement.findFirst({
    where: { employeeId },
    include: SETTLEMENT_INCLUDE,
    orderBy: { generatedAt: 'desc' },
  });
  if (!settlement) throw new AppError(404, 'No settlement exists for this employee');
  return settlement;
}

export async function listSettlements(scope: Prisma.EmployeeWhereInput) {
  return prisma.settlement.findMany({
    where: { employee: scope },
    include: SETTLEMENT_INCLUDE,
    orderBy: { generatedAt: 'desc' },
  });
}

interface Actor {
  userId: string;
  isAdmin: boolean;
}
export type { Actor as SettlementActor };

/** An approver who prepared the figures cannot also approve them, unless they hold an administrator level. */
function assertNotOwn(settlement: { calculatedBy: string | null }, actor: Actor): void {
  if (!actor.isAdmin && settlement.calculatedBy === actor.userId) {
    throw new AppError(403, 'You calculated this settlement, so someone else must decide it');
  }
}

const HEAD_FIELDS = [
  'pendingSalary',
  'gratuity',
  'noticePay',
  'expenseReimbursement',
  'leaveEncashment',
  'outstandingDeductions',
  'assetRecoveries',
] as const;

const headsOf = (row: Record<(typeof HEAD_FIELDS)[number], Prisma.Decimal>) =>
  Object.fromEntries(HEAD_FIELDS.map((k) => [k, toMoneyString(row[k])]));

export async function approveSettlement(id: string, actor: Actor) {
  return prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, id);
    if (settlement.status !== 'DRAFT') {
      throw new AppError(409, `This settlement is already ${settlement.status.toLowerCase()}`);
    }
    assertNotOwn(settlement, actor);
    const updated = await tx.settlement.update({
      where: { id },
      data: { status: 'APPROVED', approvedBy: actor.userId, approvedAt: new Date() },
      include: SETTLEMENT_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'SETTLEMENT',
      entityId: id,
      action: 'APPROVE',
      changedBy: actor.userId,
    });
    // The figures a bookkeeper needs; no ledger is written here.
    await emit(tx, 'settlement.approved', {
      settlementId: id,
      settlementNo: updated.settlementNo,
      employeeId: updated.employeeId,
      currency: updated.currency,
      fxRateToBdt: updated.fxRateToBdt.toFixed(6),
      heads: headsOf(updated),
      finalAmount: toMoneyString(updated.finalAmount),
      finalAmountBdt: toMoneyString(updated.finalAmountBdt),
      actorUserId: actor.userId,
    });
    return updated;
  });
}

/** A note is required. The settlement stays a draft; Finance recalculates or overrides and sends it again. */
export async function rejectSettlement(id: string, actor: Actor, body: SettlementRejectBody) {
  return prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, id);
    if (settlement.status !== 'DRAFT') {
      throw new AppError(409, `This settlement is already ${settlement.status.toLowerCase()}`);
    }
    assertNotOwn(settlement, actor);
    const updated = await tx.settlement.update({
      where: { id },
      data: { rejectionNote: body.note },
      include: SETTLEMENT_INCLUDE,
    });
    await writeAudit(tx, {
      entity: 'SETTLEMENT',
      entityId: id,
      action: 'REJECT',
      changedBy: actor.userId,
      note: body.note,
    });
    return updated;
  });
}

/**
 * The heads that were actually worth something, in the order the statement reads. A zero head is left out
 * rather than printed as 0: a leaver reading "Leave encashment: 0" learns nothing except that a line exists.
 */
const STATEMENT_HEADS = [
  ['pendingSalary', 'Pending salary'],
  ['gratuity', 'Gratuity'],
  ['noticePay', 'Notice pay'],
  ['expenseReimbursement', 'Expense reimbursement'],
  ['leaveEncashment', 'Leave encashment'],
  ['outstandingDeductions', 'Less: outstanding deductions'],
  ['assetRecoveries', 'Less: asset recoveries'],
] as const;

/**
 * Mails the leaver their statement, after the commit: a payment that already went through must not be undone
 * by a mail server. The address on file is the company one, which is often shut off the day someone leaves;
 * the dispatch log is how anyone finds out it bounced.
 */
async function sendStatement(settlementId: string): Promise<void> {
  const row = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: { employee: { select: { fullName: true, user: { select: { email: true } } } } },
  });
  const to = row?.employee.user.email;
  if (!row || !to) return;
  const rows = STATEMENT_HEADS.filter(([key]) => !row[key].isZero()).map(([key, label]) => ({
    label,
    value: `${row.currency} ${toMoneyString(row[key])}`,
  }));
  await sendMail({
    to,
    kind: 'SETTLEMENT_STATEMENT',
    subject: `Your final settlement statement - ${row.settlementNo}`,
    html: await renderEmail({
      serial: row.settlementNo,
      subject: 'Your final settlement statement',
      stamp: { label: 'Issued', tone: 'issued' },
      intro: `Dear ${row.employee.fullName}, your final settlement has been paid.`,
      money: {
        rows,
        netLabel: 'Net paid',
        netValue: `${row.currency} ${toMoneyString(row.finalAmount)}`,
      },
      footer: `You are receiving this because your final settlement was paid by ${env.COMPANY_NAME}.`,
    }),
    entity: 'SETTLEMENT',
    entityId: settlementId,
  });
}

/** Terminal. Marks the claims this settlement swept REIMBURSED and the recoveries it folded in collected. */
export async function paySettlement(id: string, actorUserId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const settlement = await lockSettlement(tx, id);
    if (settlement.status !== 'APPROVED') {
      throw new AppError(
        409,
        `Cannot pay a settlement that is ${settlement.status.toLowerCase()} - it must be approved first`,
      );
    }
    const row = await tx.settlement.update({
      where: { id },
      data: { status: 'PAID', paidBy: actorUserId, paidAt: new Date() },
      include: SETTLEMENT_INCLUDE,
    });
    const claims = await tx.expenseClaim.findMany({
      where: { settlementId: id, status: 'APPROVED' },
      select: { id: true },
    });
    if (claims.length > 0)
      await reimburseClaims(
        tx,
        claims.map((c) => c.id),
        { settlementId: id, actorUserId },
      );
    await sweepRecoveriesCollected(tx, { settlementId: id, status: 'PENDING' }, actorUserId);
    await writeAudit(tx, {
      entity: 'SETTLEMENT',
      entityId: id,
      action: 'PAY',
      changedBy: actorUserId,
    });
    await emit(tx, 'settlement.paid', {
      settlementId: id,
      settlementNo: row.settlementNo,
      employeeId: row.employeeId,
      currency: row.currency,
      finalAmount: toMoneyString(row.finalAmount),
      finalAmountBdt: toMoneyString(row.finalAmountBdt),
      paidOn: row.paidAt?.toISOString().slice(0, 10) ?? null,
      actorUserId,
    });
    return row;
  });
  await sendStatement(id);
  return updated;
}
