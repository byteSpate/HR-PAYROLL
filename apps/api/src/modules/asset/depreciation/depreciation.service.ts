import type { DepreciationRunDetail, DepreciationRunSummary } from '@erp/contracts/asset';
import { writeAudit } from '@erp/audit';
import {
  formatNumber,
  nextCounterValue,
  prisma,
  sum,
  type DepreciationRunStatus,
  type Tx,
} from '@erp/db';
import { emit } from '@erp/events';
import { AppError } from '@erp/utils';
import type { Viewer } from '../../employee/employee.access.js';
import { computeCharges, type DepreciableAsset } from './depreciation.compute.js';
import { depreciationPreflight } from './depreciation.preflight.js';

/** The financial year starts in July, as the audited accounts do. */
const FY_START_MONTH = 7;

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
export const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;

const RUN_INCLUDE = {
  charges: {
    orderBy: { assetId: 'asc' as const },
    include: {
      asset: { select: { assetTag: true, name: true, category: { select: { name: true } } } },
    },
  },
};

const detailOf = async (tx: Tx, id: string): Promise<DepreciationRunDetail> => {
  const run = await tx.depreciationRun.findUnique({ where: { id }, include: RUN_INCLUDE });
  if (!run) throw new AppError(404, 'Depreciation run not found');
  return {
    id: run.id,
    runNo: run.runNo,
    year: run.year,
    month: run.month,
    status: run.status,
    createdBy: run.createdBy,
    createdAt: run.createdAt.toISOString(),
    postedBy: run.postedBy,
    postedAt: run.postedAt ? run.postedAt.toISOString() : null,
    reversedBy: run.reversedBy,
    reversedAt: run.reversedAt ? run.reversedAt.toISOString() : null,
    charges: run.charges.map((c) => ({
      id: c.id,
      assetId: c.assetId,
      amount: c.amount.toFixed(2),
      openingBookValue: c.openingBookValue.toFixed(2),
      rate: c.rate.toFixed(2),
      months: c.months,
      asset: {
        assetTag: c.asset.assetTag,
        name: c.asset.name,
        categoryName: c.asset.category.name,
      },
    })),
  };
};

/** Takes the run's row lock and reads it again under it, so posting, reversing and deleting cannot interleave. */
async function lockRun(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "DepreciationRun" WHERE id = ${id} FOR UPDATE`;
  const run = await tx.depreciationRun.findUnique({ where: { id } });
  if (!run) throw new AppError(404, 'Depreciation run not found');
  return run;
}

/** Works out the month's charges from what is already posted and saves them as a draft for a person to look over. */
export async function draftRun(
  viewer: Viewer,
  body: { year: number; month: number },
): Promise<DepreciationRunDetail> {
  return prisma
    .$transaction(async (tx) => {
      const existing = await tx.depreciationRun.findFirst({
        where: { year: body.year, month: body.month, status: { not: 'REVERSED' } },
        select: { id: true, runNo: true, status: true },
      });
      if (existing)
        throw new AppError(
          409,
          `${monthLabel(body.year, body.month)} already has a depreciation run (${existing.runNo}, ${existing.status.toLowerCase()}). Reversing it frees the month.`,
        );
      const preflight = await depreciationPreflight(body, tx);
      if (!preflight.ok) throw new AppError(409, preflight.blockers[0]!.message);

      const assets = await tx.asset.findMany({
        where: {
          capitalisedAt: { not: null },
          category: { isConsumable: false, depreciationRate: { not: null } },
        },
        select: {
          id: true,
          assetTag: true,
          purchaseDate: true,
          purchaseCostBdt: true,
          capitalisedAt: true,
          retiredAt: true,
          category: { select: { depreciationRate: true } },
        },
      });
      const depreciables: DepreciableAsset[] = assets.flatMap((a) =>
        a.purchaseCostBdt === null ||
        a.purchaseDate === null ||
        a.category.depreciationRate === null
          ? []
          : [
              {
                id: a.id,
                assetTag: a.assetTag,
                purchaseDate: a.purchaseDate,
                purchaseCostBdt: a.purchaseCostBdt,
                capitalisedAt: a.capitalisedAt,
                rate: a.category.depreciationRate,
                stoppedAt: a.retiredAt,
              },
            ],
      );

      const priorRows = depreciables.length
        ? await tx.assetDepreciation.findMany({
            where: { assetId: { in: depreciables.map((a) => a.id) }, run: { status: 'POSTED' } },
            select: { assetId: true, amount: true, run: { select: { year: true, month: true } } },
          })
        : [];
      const charges = computeCharges(
        depreciables,
        priorRows.map((p) => ({
          assetId: p.assetId,
          year: p.run.year,
          month: p.run.month,
          amount: p.amount,
        })),
        body,
        FY_START_MONTH,
      );

      const runNo = formatNumber('BS-DEP', await nextCounterValue(tx, 'DEP'));
      const run = await tx.depreciationRun.create({
        data: { runNo, year: body.year, month: body.month, createdBy: viewer.sub },
      });
      await tx.assetDepreciation.createMany({
        data: charges.map((c) => ({
          runId: run.id,
          assetId: c.assetId,
          amount: c.amount,
          openingBookValue: c.openingBookValue,
          rate: c.rate,
          months: c.months,
        })),
      });
      await writeAudit(tx, {
        entity: 'DEPRECIATION_RUN',
        entityId: run.id,
        action: 'CREATE',
        changedBy: viewer.sub,
        after: { runNo, year: body.year, month: body.month, chargeCount: charges.length },
      });
      return detailOf(tx, run.id);
    })
    .catch((err: unknown) => {
      // The partial unique index: someone drafted the same month a moment earlier.
      if (typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002')
        throw new AppError(
          409,
          `${monthLabel(body.year, body.month)} already has a depreciation run.`,
        );
      throw err;
    });
}

export const getRun = (id: string) => prisma.$transaction((tx) => detailOf(tx, id));

export async function listRuns(query: {
  year?: number;
  status?: DepreciationRunStatus;
}): Promise<DepreciationRunSummary[]> {
  const rows = await prisma.depreciationRun.findMany({
    where: {
      ...(query.year ? { year: query.year } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include: { charges: { select: { amount: true } } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    runNo: r.runNo,
    year: r.year,
    month: r.month,
    status: r.status,
    chargeCount: r.charges.length,
    total: sum(r.charges.map((c) => c.amount)).toFixed(2),
  }));
}

/**
 * Finalises a draft. The charges become what later runs build on, and the totals go out as an event for
 * whatever keeps the books, grouped the two ways it will want them: by category and by owning department.
 */
export async function postRun(viewer: Viewer, id: string): Promise<DepreciationRunDetail> {
  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    if (run.status !== 'DRAFT')
      throw new AppError(
        409,
        `${run.runNo} is ${run.status.toLowerCase()}; only a draft can be posted. Reverse it to free the month.`,
      );
    const charges = await tx.assetDepreciation.findMany({
      where: { runId: id },
      include: { asset: { select: { departmentId: true, category: { select: { code: true } } } } },
    });
    if (charges.length === 0)
      throw new AppError(409, `${run.runNo} has no charges to post. Delete the draft instead.`);

    await tx.depreciationRun.update({
      where: { id },
      data: { status: 'POSTED', postedBy: viewer.sub, postedAt: new Date() },
    });
    const groups = new Map<
      string,
      { categoryCode: string; departmentId: string | null; amountBdt: ReturnType<typeof sum> }
    >();
    for (const c of charges) {
      const key = `${c.asset.category.code}::${c.asset.departmentId ?? ''}`;
      const group = groups.get(key);
      groups.set(key, {
        categoryCode: c.asset.category.code,
        departmentId: c.asset.departmentId,
        amountBdt: sum([group?.amountBdt ?? sum([]), c.amount]),
      });
    }
    await writeAudit(tx, {
      entity: 'DEPRECIATION_RUN',
      entityId: id,
      action: 'APPROVE',
      changedBy: viewer.sub,
      before: { status: 'DRAFT' },
      after: { status: 'POSTED' },
    });
    await emit(tx, 'depreciation.run.finalized', {
      runId: id,
      runNo: run.runNo,
      year: run.year,
      month: run.month,
      totalBdt: sum(charges.map((c) => c.amount)).toFixed(2),
      lines: [...groups.values()].map((g) => ({
        categoryCode: g.categoryCode,
        departmentId: g.departmentId,
        amountBdt: g.amountBdt.toFixed(2),
      })),
      actorUserId: viewer.sub,
    });
    return detailOf(tx, id);
  });
}

/** Withdraws a posted run, which frees its month and takes its charges out of every later run's starting point. */
export async function reverseRun(
  viewer: Viewer,
  id: string,
  body: { reason: string },
): Promise<DepreciationRunDetail> {
  return prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    if (run.status !== 'POSTED')
      throw new AppError(
        409,
        `${run.runNo} is ${run.status.toLowerCase()}; only a posted run can be reversed.`,
      );
    const later = await tx.depreciationRun.findFirst({
      where: {
        status: 'POSTED',
        OR: [{ year: { gt: run.year } }, { year: run.year, month: { gt: run.month } }],
      },
      select: { runNo: true },
    });
    if (later)
      throw new AppError(
        409,
        `${later.runNo} was posted after this run and builds on it. Reverse the later run first.`,
      );

    await tx.depreciationRun.update({
      where: { id },
      data: { status: 'REVERSED', reversedBy: viewer.sub, reversedAt: new Date() },
    });
    await writeAudit(tx, {
      entity: 'DEPRECIATION_RUN',
      entityId: id,
      action: 'CANCEL',
      changedBy: viewer.sub,
      before: { status: 'POSTED' },
      after: { status: 'REVERSED' },
      note: body.reason,
    });
    await emit(tx, 'depreciation.run.reversed', {
      runId: id,
      runNo: run.runNo,
      year: run.year,
      month: run.month,
      reason: body.reason,
      actorUserId: viewer.sub,
    });
    return detailOf(tx, id);
  });
}

export async function deleteRun(viewer: Viewer, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await lockRun(tx, id);
    if (run.status === 'POSTED')
      throw new AppError(409, `${run.runNo} is posted; it cannot be deleted. Reverse it instead.`);
    if (run.status === 'REVERSED')
      throw new AppError(409, `${run.runNo} is already reversed; the month is free to run again.`);
    await tx.depreciationRun.delete({ where: { id } });
    await writeAudit(tx, {
      entity: 'DEPRECIATION_RUN',
      entityId: id,
      action: 'DELETE',
      changedBy: viewer.sub,
      before: { runNo: run.runNo, year: run.year, month: run.month },
    });
  });
}
