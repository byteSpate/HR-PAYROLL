import type { Prisma, Tx } from '@erp/db';
import { emit } from '@erp/events';

/**
 * Flips PENDING recoveries to RECOVERED when the payslip or settlement that collected them is paid. It lives
 * here, called by payroll and settlement, because the dependency runs one way: payroll reads assets and
 * assets never writes into payroll.
 *
 * It sweeps status, not money: the money moved when the run was disbursed or the settlement paid, and this
 * only records that fact. N events for N recoveries is deliberate, not a breach of the bulk rule: disbursing a
 * run is one thing, but "your laptop charge was deducted" is a separate fact for each person who needs telling once.
 */
export async function sweepRecoveriesCollected(
  tx: Tx,
  where: Prisma.AssetRecoveryWhereInput,
  actorUserId: string,
): Promise<void> {
  // Read before the update, because afterwards nothing tells these apart from ones collected last month.
  const recoveries = await tx.assetRecovery.findMany({
    where: { AND: [where, { status: 'PENDING' }] },
    select: {
      id: true,
      employeeId: true,
      assetId: true,
      amount: true,
      currency: true,
      asset: { select: { assetTag: true } },
    },
  });
  if (recoveries.length === 0) return;

  await tx.assetRecovery.updateMany({
    where: { id: { in: recoveries.map((r) => r.id) } },
    data: { status: 'RECOVERED' },
  });
  for (const recovery of recoveries) {
    await emit(tx, 'asset.recovery.collected', {
      recoveryId: recovery.id,
      assetId: recovery.assetId,
      assetTag: recovery.asset.assetTag,
      employeeId: recovery.employeeId,
      amount: recovery.amount.toFixed(2),
      currency: recovery.currency,
      actorUserId,
    });
  }
}
