import type { Tx } from '@erp/db';
import { AppError } from '@erp/utils';

/**
 * Takes the asset's row lock and reads it again under that lock. Every change to an asset or its custody goes
 * through here inside its own transaction, so two handovers of one laptop, or a retirement racing an
 * assignment, run one at a time and each sees what the one before left.
 */
export async function lockAsset(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Asset" WHERE id = ${id} FOR UPDATE`;
  const asset = await tx.asset.findUnique({ where: { id }, include: { category: true } });
  if (!asset) throw new AppError(404, 'Asset not found');
  return asset;
}

/** The same for a request, so a decision, a withdrawal and a fulfilment cannot all win at once. */
export async function lockRequest(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "AssetRequest" WHERE id = ${id} FOR UPDATE`;
  const request = await tx.assetRequest.findUnique({
    where: { id },
    include: {
      category: true,
      asset: { select: { assetTag: true, name: true } },
      employee: { select: { userId: true } },
    },
  });
  if (!request) throw new AppError(404, 'Asset request not found');
  return request;
}

export async function lockRecovery(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "AssetRecovery" WHERE id = ${id} FOR UPDATE`;
  const recovery = await tx.assetRecovery.findUnique({
    where: { id },
    include: { asset: { select: { assetTag: true, name: true } } },
  });
  if (!recovery) throw new AppError(404, 'Recovery not found');
  return recovery;
}

export async function lockRepair(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "AssetRepair" WHERE id = ${id} FOR UPDATE`;
  const repair = await tx.assetRepair.findUnique({ where: { id } });
  if (!repair) throw new AppError(404, 'Repair not found');
  return repair;
}
