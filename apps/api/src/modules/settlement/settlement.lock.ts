import type { Tx } from '@erp/db';
import { AppError } from '@erp/utils';

/** Takes the settlement's row lock and reads it again under it, so approve, reject, pay and override cannot interleave. */
export async function lockSettlement(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "Settlement" WHERE id = ${id} FOR UPDATE`;
  const settlement = await tx.settlement.findUnique({ where: { id } });
  if (!settlement) throw new AppError(404, 'Settlement not found');
  return settlement;
}
