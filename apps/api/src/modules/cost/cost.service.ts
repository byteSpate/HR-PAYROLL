import {
  commitmentBody,
  costBody,
  costCategoryBody,
  listCostsQuery,
  payCostBody,
  updateCommitmentBody,
  updateCostBody,
  updateCostCategoryBody,
  type ListCostsQuery,
} from '@erp/contracts/cost';
import { writeAudit } from '@erp/audit';
import { dec, prisma, type Prisma, type Tx } from '@erp/db';
import { emit } from '@erp/events';
import { formatDateOnly, parseDateOnly } from '@erp/export';
import { AppError, describeUsage } from '@erp/utils';
import { billView, categoryView, commitmentView } from './cost.view.js';

const isUnique = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
const BILL_INCLUDE = {
  category: true,
  commitment: { include: { category: true } },
  attachments: true,
} as const;

/** Takes the bill's row lock and reads it again under it, so paying twice or editing while paid cannot both win. */
async function lockBill(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "OperatingCost" WHERE id = ${id} FOR UPDATE`;
  const bill = await tx.operatingCost.findUnique({ where: { id }, include: { category: true } });
  if (!bill) throw new AppError(404, 'Cost not found');
  return bill;
}

export async function listCategories() {
  return (await prisma.costCategory.findMany({ orderBy: { name: 'asc' } })).map(categoryView);
}

export async function createCategory(actorUserId: string, input: unknown) {
  const body = costCategoryBody.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.costCategory.create({ data: body });
      await writeAudit(tx, {
        entity: 'COST_CATEGORY',
        entityId: category.id,
        action: 'CREATE',
        changedBy: actorUserId,
        after: { code: category.code, name: category.name },
      });
      return categoryView(category);
    });
  } catch (err) {
    if (isUnique(err)) throw new AppError(409, 'A category with this code or name already exists');
    throw err;
  }
}

export async function updateCategory(actorUserId: string, id: string, input: unknown) {
  const body = updateCostCategoryBody.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.costCategory.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'Cost category not found');
      if (body.name === undefined || body.name === existing.name) return categoryView(existing);
      const updated = await tx.costCategory.update({ where: { id }, data: { name: body.name } });
      await writeAudit(tx, {
        entity: 'COST_CATEGORY',
        entityId: id,
        action: 'UPDATE',
        changedBy: actorUserId,
        before: { name: existing.name },
        after: { name: body.name },
      });
      return categoryView(updated);
    });
  } catch (err) {
    if (isUnique(err)) throw new AppError(409, 'A category with this name already exists');
    throw err;
  }
}

export async function deleteCategory(actorUserId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.costCategory.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Cost category not found');
    const [costs, commitments] = await Promise.all([
      tx.operatingCost.count({ where: { categoryId: id } }),
      tx.costCommitment.count({ where: { categoryId: id } }),
    ]);
    const usage = describeUsage([
      { noun: 'cost', count: costs },
      { noun: 'commitment', count: commitments },
    ]);
    if (usage !== null)
      throw new AppError(409, `This category is still in use by ${usage}. Reassign them first.`);
    await tx.costCategory.delete({ where: { id } });
    await writeAudit(tx, {
      entity: 'COST_CATEGORY',
      entityId: id,
      action: 'DELETE',
      changedBy: actorUserId,
      before: { code: existing.code, name: existing.name },
    });
  });
}

export async function listCommitments(active?: boolean) {
  const rows = await prisma.costCommitment.findMany({
    where: active ? { endedOn: null } : {},
    include: { category: true },
    orderBy: { startedOn: 'desc' },
  });
  return rows.map(commitmentView);
}

export async function createCommitment(actorUserId: string, input: unknown) {
  const body = commitmentBody.parse(input);
  return prisma.$transaction(async (tx) => {
    if (
      !(await tx.costCategory.findUnique({ where: { id: body.categoryId }, select: { id: true } }))
    )
      throw new AppError(400, 'Cost category not found');
    const commitment = await tx.costCommitment.create({
      data: {
        categoryId: body.categoryId,
        label: body.label,
        payee: body.payee,
        amount: body.amount === undefined ? null : dec(body.amount),
        currency: body.currency ?? 'BDT',
        dueDay: body.dueDay ?? null,
        startedOn: parseDateOnly(body.startedOn),
        notes: body.notes ?? null,
      },
      include: { category: true },
    });
    await writeAudit(tx, {
      entity: 'COST_COMMITMENT',
      entityId: commitment.id,
      action: 'CREATE',
      changedBy: actorUserId,
      after: { categoryId: body.categoryId, label: body.label, payee: body.payee },
    });
    return commitmentView(commitment);
  });
}

export async function updateCommitment(actorUserId: string, id: string, input: unknown) {
  const body = updateCommitmentBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.costCommitment.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!existing) throw new AppError(404, 'Cost commitment not found');
    const data: Prisma.CostCommitmentUncheckedUpdateInput = {};
    const before: Record<string, string | number | null> = {};
    const after: Record<string, string | number | null> = {};
    const change = (
      key: string,
      was: string | number | null,
      now: string | number | null,
      apply: () => void,
    ) => {
      if (was === now) return;
      before[key] = was;
      after[key] = now;
      apply();
    };
    if (body.label !== undefined)
      change('label', existing.label, body.label, () => (data.label = body.label));
    if (body.payee !== undefined)
      change('payee', existing.payee, body.payee, () => (data.payee = body.payee));
    if (body.amount !== undefined) {
      const next = body.amount === null ? null : dec(body.amount);
      change(
        'amount',
        existing.amount?.toFixed(2) ?? null,
        next?.toFixed(2) ?? null,
        () => (data.amount = next),
      );
    }
    if (body.currency !== undefined)
      change('currency', existing.currency, body.currency, () => (data.currency = body.currency));
    if (body.dueDay !== undefined)
      change('dueDay', existing.dueDay, body.dueDay, () => (data.dueDay = body.dueDay));
    if (body.notes !== undefined)
      change('notes', existing.notes, body.notes, () => (data.notes = body.notes));
    if (body.endedOn !== undefined)
      change(
        'endedOn',
        existing.endedOn ? formatDateOnly(existing.endedOn) : null,
        body.endedOn,
        () => (data.endedOn = body.endedOn === null ? null : parseDateOnly(body.endedOn!)),
      );
    if (Object.keys(data).length === 0) return commitmentView(existing);
    const updated = await tx.costCommitment.update({
      where: { id },
      data,
      include: { category: true },
    });
    await writeAudit(tx, {
      entity: 'COST_COMMITMENT',
      entityId: id,
      action: 'UPDATE',
      changedBy: actorUserId,
      before,
      after,
    });
    return commitmentView(updated);
  });
}

export async function listCosts(query: ListCostsQuery) {
  const rows = await prisma.operatingCost.findMany({
    where: {
      ...(query.year !== undefined ? { periodYear: query.year } : {}),
      ...(query.month !== undefined ? { periodMonth: query.month } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    include: BILL_INCLUDE,
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map(billView);
}

export const parseListQuery = (query: unknown) => listCostsQuery.parse(query);

export async function getCost(id: string) {
  const bill = await prisma.operatingCost.findUnique({ where: { id }, include: BILL_INCLUDE });
  if (!bill) throw new AppError(404, 'Cost not found');
  return billView(bill);
}

export async function createCost(actorUserId: string, input: unknown) {
  const body = costBody.parse(input);
  // Operating costs carry no exchange rate, so a foreign bill could never be reported in BDT. Record it in BDT at the rate paid.
  if (body.currency && body.currency !== 'BDT')
    throw new AppError(
      400,
      `Operating costs carry no exchange rate, so a bill in ${body.currency} cannot be reported in BDT. Record it in BDT at the rate you paid.`,
    );
  return prisma.$transaction(async (tx) => {
    if (
      !(await tx.costCategory.findUnique({ where: { id: body.categoryId }, select: { id: true } }))
    )
      throw new AppError(400, 'Cost category not found');
    if (body.commitmentId) {
      if (
        !(await tx.costCommitment.findUnique({
          where: { id: body.commitmentId },
          select: { id: true },
        }))
      )
        throw new AppError(400, 'Cost commitment not found');
      const clash = await tx.operatingCost.findFirst({
        where: {
          commitmentId: body.commitmentId,
          periodYear: body.periodYear,
          periodMonth: body.periodMonth,
        },
      });
      if (clash)
        throw new AppError(
          409,
          `${clash.label} for ${body.periodMonth}/${body.periodYear} is already recorded`,
        );
    }
    const cost = await tx.operatingCost.create({
      data: {
        categoryId: body.categoryId,
        commitmentId: body.commitmentId ?? null,
        label: body.label,
        payee: body.payee,
        periodMonth: body.periodMonth,
        periodYear: body.periodYear,
        amount: dec(body.amount),
        currency: 'BDT',
        dueDate: body.dueDate ? parseDateOnly(body.dueDate) : null,
        notes: body.notes ?? null,
        createdBy: actorUserId,
      },
      include: { category: true },
    });
    const amount = cost.amount.toFixed(2);
    await writeAudit(tx, {
      entity: 'COST',
      entityId: cost.id,
      action: 'CREATE',
      changedBy: actorUserId,
      after: {
        categoryId: body.categoryId,
        label: body.label,
        amount,
        periodMonth: body.periodMonth,
        periodYear: body.periodYear,
      },
    });
    await emit(tx, 'cost.bill.accrued', {
      costId: cost.id,
      categoryCode: cost.category.code,
      label: cost.label,
      payee: cost.payee,
      amount,
      currency: cost.currency,
      periodMonth: cost.periodMonth,
      periodYear: cost.periodYear,
      actorUserId,
    });
    return getBill(tx, cost.id);
  });
}

const getBill = async (tx: Tx, id: string) =>
  billView(await tx.operatingCost.findUniqueOrThrow({ where: { id }, include: BILL_INCLUDE }));

export async function updateCost(actorUserId: string, id: string, input: unknown) {
  const body = updateCostBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await lockBill(tx, id);
    const data: Prisma.OperatingCostUncheckedUpdateInput = {};
    const before: Record<string, string | null> = {};
    const after: Record<string, string | null> = {};
    const change = (key: string, was: string | null, now: string | null, apply: () => void) => {
      if (was === now) return;
      before[key] = was;
      after[key] = now;
      apply();
    };
    if (body.categoryId !== undefined)
      change(
        'categoryId',
        existing.categoryId,
        body.categoryId,
        () => (data.categoryId = body.categoryId),
      );
    if (body.label !== undefined)
      change('label', existing.label, body.label, () => (data.label = body.label));
    if (body.payee !== undefined)
      change('payee', existing.payee, body.payee, () => (data.payee = body.payee));
    if (body.amount !== undefined)
      change(
        'amount',
        existing.amount.toFixed(2),
        dec(body.amount).toFixed(2),
        () => (data.amount = dec(body.amount!)),
      );
    if (body.currency !== undefined) {
      if (body.currency !== 'BDT')
        throw new AppError(
          400,
          `Operating costs carry no exchange rate, so a bill in ${body.currency} cannot be reported in BDT.`,
        );
      change('currency', existing.currency, body.currency, () => (data.currency = body.currency));
    }
    if (body.dueDate !== undefined)
      change(
        'dueDate',
        existing.dueDate ? formatDateOnly(existing.dueDate) : null,
        body.dueDate,
        () => (data.dueDate = body.dueDate === null ? null : parseDateOnly(body.dueDate!)),
      );
    if (body.notes !== undefined)
      change('notes', existing.notes, body.notes, () => (data.notes = body.notes));
    if (Object.keys(data).length === 0) return getBill(tx, id);

    // A paid bill is a fact somebody settled: its category, amount and currency are what was paid.
    if (
      existing.status === 'PAID' &&
      (data.categoryId !== undefined || data.amount !== undefined || data.currency !== undefined)
    )
      throw new AppError(
        409,
        'This bill has been paid, so its category, amount and currency are fixed.',
      );
    if (
      data.categoryId !== undefined &&
      !(await tx.costCategory.findUnique({ where: { id: body.categoryId! }, select: { id: true } }))
    )
      throw new AppError(400, 'Cost category not found');
    await tx.operatingCost.update({ where: { id }, data });
    await writeAudit(tx, {
      entity: 'COST',
      entityId: id,
      action: 'UPDATE',
      changedBy: actorUserId,
      before,
      after,
    });
    return getBill(tx, id);
  });
}

export async function payCost(actorUserId: string, id: string, input: unknown) {
  const body = payCostBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const existing = await lockBill(tx, id);
    if (existing.status === 'PAID') throw new AppError(409, 'This bill is already marked paid');
    const paidAt = body.paidAt ? parseDateOnly(body.paidAt) : new Date();
    await tx.operatingCost.update({
      where: { id },
      data: { status: 'PAID', paidAt, paidBy: actorUserId, paymentRef: body.paymentRef ?? null },
    });
    await writeAudit(tx, {
      entity: 'COST',
      entityId: id,
      action: 'PAY',
      changedBy: actorUserId,
      before: { status: 'PENDING' },
      after: { status: 'PAID', paidAt: paidAt.toISOString(), paymentRef: body.paymentRef ?? null },
    });
    await emit(tx, 'cost.bill.paid', {
      costId: id,
      categoryCode: existing.category.code,
      label: existing.label,
      payee: existing.payee,
      amount: existing.amount.toFixed(2),
      currency: existing.currency,
      paidOn: formatDateOnly(paidAt),
      paymentRef: body.paymentRef ?? null,
      actorUserId,
    });
    return getBill(tx, id);
  });
}
