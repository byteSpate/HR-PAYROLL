import { categoryBody, updateCategoryBody } from '@erp/contracts/asset';
import { writeAudit } from '@erp/audit';
import { dec, prisma, type Prisma } from '@erp/db';
import { AppError, describeUsage } from '@erp/utils';
import { categoryView } from './asset.view.js';

export async function listCategories() {
  return (await prisma.assetCategory.findMany({ orderBy: { name: 'asc' } })).map(categoryView);
}

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

export async function createCategory(actorUserId: string, input: unknown) {
  const body = categoryBody.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.assetCategory.create({
        data: {
          code: body.code,
          name: body.name,
          requiresSerial: body.requiresSerial ?? true,
          isConsumable: body.isConsumable ?? false,
          usefulLifeMonths: body.usefulLifeMonths ?? null,
          depreciationRate: body.depreciationRate ?? null,
          classification: body.classification,
          tracksIndividually: body.tracksIndividually ?? true,
        },
      });
      await writeAudit(tx, {
        entity: 'ASSET_CATEGORY',
        entityId: category.id,
        action: 'CREATE',
        changedBy: actorUserId,
        after: { code: category.code, name: category.name },
      });
      return categoryView(category);
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError(409, 'A category with this code or name already exists');
    throw err;
  }
}

/**
 * No deactivate: a category is either in use, and deleting refuses, or it is not, and deleting it outright is
 * cleaner than leaving a retired row in every picker forever.
 */
export async function updateCategory(actorUserId: string, id: string, input: unknown) {
  const body = updateCategoryBody.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.assetCategory.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'Asset category not found');

      // Requiring a serial from now on would make every serial-less asset already here invalid; refuse instead of drifting from the rule.
      if (body.requiresSerial === true && !existing.requiresSerial) {
        const missing = await tx.asset.count({ where: { categoryId: id, serialNumber: null } });
        if (missing > 0)
          throw new AppError(409, `${missing} asset(s) in this category have no serial number`);
      }
      // Registered assets have tags, custody and history that a supply has no room for.
      if (body.tracksIndividually === false && existing.tracksIndividually) {
        const registered = await tx.asset.count({ where: { categoryId: id } });
        if (registered > 0)
          throw new AppError(
            409,
            `${registered} asset(s) are already registered in this category, so it cannot become a supply.`,
          );
      }

      const data: Prisma.AssetCategoryUpdateInput = {};
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of [
        'name',
        'requiresSerial',
        'isConsumable',
        'usefulLifeMonths',
        'classification',
        'tracksIndividually',
      ] as const) {
        const next = body[key];
        if (next === undefined || next === existing[key]) continue;
        before[key] = existing[key];
        after[key] = next;
        (data as Record<string, unknown>)[key] = next;
      }
      if (body.depreciationRate !== undefined) {
        const was = existing.depreciationRate?.toFixed(2) ?? null;
        const now = body.depreciationRate === null ? null : dec(body.depreciationRate).toFixed(2);
        if (was !== now) {
          before['depreciationRate'] = was;
          after['depreciationRate'] = now;
          data.depreciationRate = now;
        }
      }
      if (Object.keys(data).length === 0) return categoryView(existing);
      const updated = await tx.assetCategory.update({ where: { id }, data });
      await writeAudit(tx, {
        entity: 'ASSET_CATEGORY',
        entityId: id,
        action: 'UPDATE',
        changedBy: actorUserId,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      });
      return categoryView(updated);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'A category with this name already exists');
    throw err;
  }
}

export async function deleteCategory(actorUserId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.assetCategory.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Asset category not found');
    // Both relations are required, so the database would refuse anyway, as an error the client cannot read.
    const [assets, requests] = await Promise.all([
      tx.asset.count({ where: { categoryId: id } }),
      tx.assetRequest.count({ where: { categoryId: id } }),
    ]);
    const usage = describeUsage([
      { noun: 'asset', count: assets },
      { noun: 'request', count: requests },
    ]);
    if (usage !== null)
      throw new AppError(409, `This category is still in use by ${usage}. Reassign them first.`);
    await tx.assetCategory.delete({ where: { id } });
    await writeAudit(tx, {
      entity: 'ASSET_CATEGORY',
      entityId: id,
      action: 'DELETE',
      changedBy: actorUserId,
      before: { code: existing.code, name: existing.name },
    });
  });
}
