import type { Tx } from '@erp/db';
import { AppError } from '@erp/utils';
import { CLAIM_INCLUDE } from './expense.view.js';

/**
 * Takes the claim's row lock and reads it again under that lock. Every change to a claim, and every
 * decision on one, goes through here inside its own transaction, so they run one at a time and each
 * sees what the one before left. A status or figure read before the transaction started proves nothing
 * once the transaction runs: an approval may have landed in between.
 */
export async function lockClaim(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "ExpenseClaim" WHERE id = ${id} FOR UPDATE`;
  const claim = await tx.expenseClaim.findUnique({ where: { id }, include: CLAIM_INCLUDE });
  if (!claim) throw new AppError(404, 'Expense claim not found');
  return claim;
}

/**
 * The locked claim, once it is known to be the owner's and still pending. Once a claim is decided its
 * figures and evidence are the basis of that decision, and a reimbursed one is joined to a payslip that
 * has paid it. Another person's claim is a 404, so existence is not confirmed.
 */
export async function lockOwnPending(tx: Tx, ownerEmployeeId: string, id: string, what: 'it' | 'its receipts') {
  const claim = await lockClaim(tx, id);
  if (claim.employeeId !== ownerEmployeeId) throw new AppError(404, 'Expense claim not found');
  if (claim.status !== 'PENDING') throw new AppError(409, `This claim has already been ${claim.status.toLowerCase()}, so ${what} can no longer be changed.`);
  return claim;
}
