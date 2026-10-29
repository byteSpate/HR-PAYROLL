import type { Tx } from './client.js';

/**
 * The next number in a series, taken by an upsert-increment inside the caller's transaction. The row lock the
 * increment takes serialises concurrent writers, and a rolled-back transaction gives its number back.
 */
export async function nextCounterValue(tx: Tx, series: string): Promise<number> {
  const row = await tx.idCounter.upsert({
    where: { id: series },
    update: { value: { increment: 1 } },
    create: { id: series, value: 1 },
  });
  return row.value;
}

/** "BS-AST-00042": five digits, like an employee code, growing past them rather than truncating. */
export const formatNumber = (prefix: string, value: number) =>
  `${prefix}-${String(value).padStart(5, '0')}`;
