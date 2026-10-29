import type {
  CreateAssetBody,
  ListAssetsQuery,
  LifecycleBody,
  UpdateAssetBody,
} from '@erp/contracts/asset';
import { writeAudit } from '@erp/audit';
import { dec, formatNumber, nextCounterValue, prisma, type Prisma, type Tx } from '@erp/db';
import { emit } from '@erp/events';
import { formatDateOnly, parseDateOnly } from '@erp/export';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { canSeeCosts, manageableAssets, readableAssets } from './asset.access.js';
import { lockAsset } from './asset.lock.js';
import { createRecoveryIn } from './asset.recoveries.js';
import {
  assetView,
  attachmentView,
  assignmentWithView,
  repairView,
  type AssetRow,
} from './asset.view.js';

const SERIES = 'AST';

/** "BS-AST-00042", from the same counter mechanism that will issue payslip and run numbers. */
export async function nextAssetTag(tx: Tx): Promise<string> {
  return formatNumber('BS-AST', await nextCounterValue(tx, SERIES));
}

/** One asset as the viewer sees it, with its holder and repair state read from the open rows. */
export async function presentAsset(db: Tx | typeof prisma, viewer: Viewer, id: string) {
  const asset = await db.asset.findUniqueOrThrow({
    where: { id },
    include: {
      category: true,
      assignments: OPEN_HOLDER,
      repairs: { where: { returnedAt: null }, take: 1, select: { id: true } },
    },
  });
  const { assignments, repairs, ...row } = asset;
  return assetView({
    asset: row,
    openAssignment: assignments[0] ?? null,
    hasOpenRepair: repairs.length > 0,
    costs: canSeeCosts(viewer),
  });
}

const OPEN_HOLDER = {
  where: { returnedAt: null },
  take: 1,
  include: { employee: { select: { employeeCode: true, fullName: true } } },
} as const;

export async function createAsset(viewer: Viewer, body: CreateAssetBody) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.assetCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) throw new AppError(400, 'Asset category not found');
    // Enforced when the asset is made, not left as a nullable field everyone forgets.
    if (category.requiresSerial && !body.serialNumber)
      throw new AppError(400, `A serial number is required for ${category.name}`);
    if (
      body.departmentId &&
      !(await tx.department.findUnique({ where: { id: body.departmentId }, select: { id: true } }))
    )
      throw new AppError(400, 'Department not found');

    const assetTag = body.assetTag ?? (await nextAssetTag(tx));
    const asset = await tx.asset
      .create({
        data: {
          assetTag,
          categoryId: category.id,
          name: body.name,
          serialNumber: body.serialNumber ?? null,
          model: body.model ?? null,
          notes: body.notes ?? null,
          purchaseDate: body.purchaseDate ? parseDateOnly(body.purchaseDate) : null,
          purchaseCost: body.purchaseCost === undefined ? null : dec(body.purchaseCost),
          currency: body.currency ?? 'BDT',
          vendor: body.vendor ?? null,
          warrantyExpiry: body.warrantyExpiry ? parseDateOnly(body.warrantyExpiry) : null,
          departmentId: body.departmentId ?? null,
          location: body.location ?? null,
        },
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err))
          throw new AppError(409, 'An asset with this tag or serial number already exists');
        throw err;
      });
    await writeAudit(tx, {
      entity: 'ASSET',
      entityId: asset.id,
      action: 'CREATE',
      changedBy: viewer.sub,
      after: { assetTag, name: body.name, categoryId: category.id },
    });
    return presentAsset(tx, viewer, asset.id);
  });
}

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

/**
 * Write-off. Refused while somebody still has it: retiring a held asset would orphan the open assignment
 * instead of closing it.
 */
export async function retireAsset(viewer: Viewer, id: string, body: LifecycleBody) {
  await assertManageable(viewer, id);
  return prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, id);
    if (asset.lifecycle === 'RETIRED') throw new AppError(409, 'This asset is already retired');
    if (asset.lifecycle === 'LOST')
      throw new AppError(409, 'This asset has already been marked lost');
    if ((await tx.assetAssignment.count({ where: { assetId: id, returnedAt: null } })) > 0)
      throw new AppError(409, 'Take the asset back before retiring it');

    await tx.asset.update({
      where: { id },
      data: {
        lifecycle: 'RETIRED',
        retiredAt: new Date(),
        retiredBy: viewer.sub,
        retirementNote: body.note,
      },
    });
    await writeAudit(tx, {
      entity: 'ASSET',
      entityId: id,
      action: 'RETIRE',
      changedBy: viewer.sub,
      before: { lifecycle: asset.lifecycle },
      after: { lifecycle: 'RETIRED' },
      note: body.note,
    });
    await emit(tx, 'asset.retired', {
      assetId: id,
      assetTag: asset.assetTag,
      assetName: asset.name,
      note: body.note,
      actorUserId: viewer.sub,
    });
    return presentAsset(tx, viewer, id);
  });
}

/**
 * A lost laptop is lost from somebody's desk, so this does not insist on a return first: that would mean
 * fabricating a handover that never happened.
 */
export async function markAssetLost(viewer: Viewer, id: string, body: LifecycleBody) {
  await assertManageable(viewer, id);
  return prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, id);
    if (asset.lifecycle === 'RETIRED')
      throw new AppError(409, 'A retired asset cannot be marked lost');
    if (asset.lifecycle === 'LOST') throw new AppError(409, 'This asset is already marked lost');

    await tx.asset.update({
      where: { id },
      data: {
        lifecycle: 'LOST',
        retiredAt: new Date(),
        retiredBy: viewer.sub,
        retirementNote: body.note,
      },
    });

    // The same dialog offers to price the recovery while the circumstances are fresh. The debt is raised against
    // whoever holds the asset; one missing from the store with nobody holding it is a loss with no one to recover from.
    const holder = await tx.assetAssignment.findFirst({
      where: { assetId: id, returnedAt: null },
      orderBy: { assignedAt: 'desc' },
      select: { id: true, employeeId: true },
    });
    if (body.recovery && holder) {
      await createRecoveryIn(
        tx,
        {
          assetId: id,
          employeeId: holder.employeeId,
          assignmentId: holder.id,
          amount: body.recovery.amount,
          currency: body.recovery.currency,
          reason: body.recovery.reason,
          kind: body.recovery.kind ?? 'LOST',
        },
        viewer.sub,
      );
    }
    await writeAudit(tx, {
      entity: 'ASSET',
      entityId: id,
      action: 'MARK_LOST',
      changedBy: viewer.sub,
      before: { lifecycle: asset.lifecycle },
      after: { lifecycle: 'LOST' },
      note: body.note,
    });
    await emit(tx, 'asset.lost', {
      assetId: id,
      assetTag: asset.assetTag,
      assetName: asset.name,
      note: body.note,
      actorUserId: viewer.sub,
    });
    return presentAsset(tx, viewer, id);
  });
}

/** A manage grant only reaches the assets in its scope; one outside it does not exist as far as the caller can tell. */
export async function assertManageable(viewer: Viewer, id: string): Promise<void> {
  const found = await prisma.asset.count({
    where: { AND: [{ id }, await manageableAssets(viewer)] },
  });
  if (found === 0) throw new AppError(404, 'Asset not found');
}

/** Scoped by what the viewer holds or reaches, with each row's status derived from whether an open assignment or repair exists. */
export async function listAssets(viewer: Viewer, filters: ListAssetsQuery = {}) {
  const where: Prisma.AssetWhereInput = {
    AND: [
      await readableAssets(viewer),
      {
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: 'insensitive' as const } },
                { assetTag: { contains: filters.q, mode: 'insensitive' as const } },
                { serialNumber: { contains: filters.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
    ],
  };
  const rows = await prisma.asset.findMany({
    where,
    include: {
      category: true,
      assignments: OPEN_HOLDER,
      repairs: { where: { returnedAt: null }, take: 1, select: { id: true } },
    },
    orderBy: { assetTag: 'asc' },
  });
  const costs = canSeeCosts(viewer);
  const presented = rows.map(({ assignments, repairs, ...asset }) =>
    assetView({
      asset: asset as AssetRow,
      openAssignment: assignments[0] ?? null,
      hasOpenRepair: repairs.length > 0,
      costs,
    }),
  );
  // Status is derived, so it filters after the fetch.
  return filters.status ? presented.filter((a) => a.status === filters.status) : presented;
}

/** An asset outside the viewer's reach is a 404, so probing ids teaches nothing about what exists. */
export async function getAsset(viewer: Viewer, id: string) {
  const asset = await prisma.asset.findFirst({
    where: { AND: [{ id }, await readableAssets(viewer)] },
    include: {
      category: true,
      department: true,
      assignments: {
        orderBy: { assignedAt: 'desc' },
        include: { employee: { select: { id: true, employeeCode: true, fullName: true } } },
      },
      repairs: { orderBy: { sentAt: 'desc' } },
      attachments: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!asset) throw new AppError(404, 'Asset not found');
  const costs = canSeeCosts(viewer);
  const open = asset.assignments.find((a) => a.returnedAt === null) ?? null;
  return {
    ...assetView({
      asset,
      openAssignment: open,
      hasOpenRepair: asset.repairs.some((r) => r.returnedAt === null),
      costs,
    }),
    notes: asset.notes,
    purchaseDate: asset.purchaseDate ? formatDateOnly(asset.purchaseDate) : null,
    department: asset.department ? { id: asset.department.id, name: asset.department.name } : null,
    retiredAt: asset.retiredAt ? asset.retiredAt.toISOString() : null,
    retirementNote: asset.retirementNote,
    assignments: asset.assignments.map((a) => assignmentWithView(a)),
    repairs: asset.repairs.map((r) => repairView(r, costs)),
    attachments: asset.attachments.map(attachmentView),
  };
}

/** Only the fields that actually changed land in the update and the audit row. */
export async function updateAsset(viewer: Viewer, id: string, body: UpdateAssetBody) {
  await assertManageable(viewer, id);
  return prisma.$transaction(async (tx) => {
    const existing = await lockAsset(tx, id);

    if (body.categoryId && body.categoryId !== existing.categoryId) {
      const next = await tx.assetCategory.findUnique({ where: { id: body.categoryId } });
      if (!next) throw new AppError(400, 'Asset category not found');
      const serial = body.serialNumber !== undefined ? body.serialNumber : existing.serialNumber;
      if (next.requiresSerial && !serial)
        throw new AppError(409, `A serial number is required for ${next.name}`);
    }

    const data: Prisma.AssetUncheckedUpdateInput = {};
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
    if (body.name !== undefined)
      change('name', existing.name, body.name, () => (data.name = body.name));
    if (body.assetTag !== undefined)
      change('assetTag', existing.assetTag, body.assetTag, () => (data.assetTag = body.assetTag));
    if (body.serialNumber !== undefined)
      change(
        'serialNumber',
        existing.serialNumber,
        body.serialNumber,
        () => (data.serialNumber = body.serialNumber),
      );
    if (body.model !== undefined)
      change('model', existing.model, body.model, () => (data.model = body.model));
    if (body.notes !== undefined)
      change('notes', existing.notes, body.notes, () => (data.notes = body.notes));
    if (body.purchaseDate !== undefined)
      change(
        'purchaseDate',
        existing.purchaseDate ? formatDateOnly(existing.purchaseDate) : null,
        body.purchaseDate,
        () => (data.purchaseDate = parseDateOnly(body.purchaseDate!)),
      );
    if (body.purchaseCost !== undefined) {
      const next = dec(body.purchaseCost);
      change(
        'purchaseCost',
        existing.purchaseCost ? existing.purchaseCost.toFixed(2) : null,
        next.toFixed(2),
        () => (data.purchaseCost = next),
      );
    }
    if (body.currency !== undefined)
      change('currency', existing.currency, body.currency, () => (data.currency = body.currency));
    if (body.vendor !== undefined)
      change('vendor', existing.vendor, body.vendor, () => (data.vendor = body.vendor));
    if (body.warrantyExpiry !== undefined)
      change(
        'warrantyExpiry',
        existing.warrantyExpiry ? formatDateOnly(existing.warrantyExpiry) : null,
        body.warrantyExpiry,
        () => (data.warrantyExpiry = parseDateOnly(body.warrantyExpiry!)),
      );
    if (body.departmentId !== undefined)
      change(
        'departmentId',
        existing.departmentId,
        body.departmentId,
        () => (data.departmentId = body.departmentId),
      );
    if (body.location !== undefined)
      change('location', existing.location, body.location, () => (data.location = body.location));

    // A cost frozen at capitalisation is the basis of every later figure; changing what was paid would quietly rewrite it.
    if (existing.capitalisedAt && (data.purchaseCost !== undefined || data.currency !== undefined))
      throw new AppError(
        409,
        `${existing.assetTag} has been capitalised, so its cost and currency can no longer be changed.`,
      );

    if (Object.keys(data).length === 0) return presentAsset(tx, viewer, id);
    await tx.asset.update({ where: { id }, data }).catch((err: unknown) => {
      if (isUniqueViolation(err))
        throw new AppError(409, 'An asset with this tag or serial number already exists');
      throw err;
    });
    await writeAudit(tx, {
      entity: 'ASSET',
      entityId: id,
      action: 'UPDATE',
      changedBy: viewer.sub,
      before,
      after,
    });
    return presentAsset(tx, viewer, id);
  });
}
