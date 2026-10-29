import { prisma, type Tx } from '@erp/db';
import { AppError } from '@erp/utils';

const MONTH_NAMES = [
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

/**
 * DRAFT and SUBMITTED deliberately pass. Neither has paid anybody yet, and a run still being worked is expected
 * to be reprocessed: locking at SUBMITTED would mean a rejected run could never have its cause fixed.
 */
const LOCKED = ['APPROVED', 'DISBURSED'] as const;

/**
 * Throws 409 when `date` falls in a month whose payroll is already approved or disbursed, because anything that
 * would change what that month should have paid would make money already decided incorrect. Reads the date in
 * UTC, as every calendar date here is stored. Shared, not part of payroll: attendance writes call it too, and
 * attendance cannot import payroll.
 */
export async function assertMonthNotLocked(
  date: Date,
  db: Tx | typeof prisma = prisma,
): Promise<void> {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const run = await db.payrollRun.findFirst({
    where: { month, year, deletedAt: null },
    select: { status: true },
  });
  if (run && (LOCKED as readonly string[]).includes(run.status)) {
    throw new AppError(
      409,
      `${MONTH_NAMES[month - 1]} ${year} payroll is already ${run.status.toLowerCase()}. Changes to that month would make money already paid incorrect.`,
    );
  }
}
