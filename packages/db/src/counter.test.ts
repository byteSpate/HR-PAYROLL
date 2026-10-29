import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from './client.js';
import { formatNumber, nextCounterValue } from './counter.js';

const series = 'ZZ_COUNTER_TEST';

describe('nextCounterValue', () => {
  afterAll(async () => {
    await prisma.idCounter.deleteMany({ where: { id: series } });
  });

  it('starts at 1 and counts up, one number per call even when callers race', async () => {
    const taken = await Promise.all(
      Array.from({ length: 8 }, () => prisma.$transaction((tx) => nextCounterValue(tx, series))),
    );
    expect([...taken].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('never gives back a number a rolled-back transaction took', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        await nextCounterValue(tx, series);
        throw new Error('abandoned');
      }),
    ).rejects.toThrow('abandoned');
    expect(await prisma.$transaction((tx) => nextCounterValue(tx, series))).toBe(9);
  });
});

describe('formatNumber', () => {
  it('pads to five digits, like an employee code, and keeps growing past them', () => {
    expect(formatNumber('BS-AST', 42)).toBe('BS-AST-00042');
    expect(formatNumber('BS-AST', 123456)).toBe('BS-AST-123456');
  });
});
