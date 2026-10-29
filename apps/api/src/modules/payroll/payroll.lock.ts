import type { Tx } from '@erp/db';
import { AppError } from '@erp/utils';

/**
 * Takes the run's row lock and reads it again under that lock, so processing, submitting, approving,
 * rejecting, disbursing and deleting cannot interleave: each sees the status the one before left.
 */
export async function lockRun(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "PayrollRun" WHERE id = ${id} FOR UPDATE`;
  const run = await tx.payrollRun.findUnique({ where: { id } });
  if (!run || run.deletedAt) throw new AppError(404, 'Payroll run not found');
  return run;
}
