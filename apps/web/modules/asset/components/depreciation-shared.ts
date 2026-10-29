import type { DepreciationRunStatus } from '../types';

export const RUN_STATUS_LABEL: Record<DepreciationRunStatus, string> = {
  DRAFT: 'Draft',
  POSTED: 'Posted',
  REVERSED: 'Reversed',
};

export const RUN_STATUS_TONE: Record<DepreciationRunStatus, 'neutral' | 'green' | 'yellow'> = {
  DRAFT: 'yellow',
  POSTED: 'green',
  REVERSED: 'neutral',
};

/**
 * Integer paisa, so a column of amounts adds up exactly: 0.1 + 0.2 does not in floating point. Returns NaN for
 * anything that is not a plain decimal.
 */
function toPaisa(input: string): number {
  const trimmed = input.trim();
  if (trimmed === '') return 0;
  if (!/^\d{0,12}(\.\d{0,2})?$/.test(trimmed)) return Number.NaN;
  const [whole, frac = ''] = trimmed.split('.');
  return Number(whole || '0') * 100 + Number(frac.padEnd(2, '0'));
}

export function fromPaisa(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(paisa);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function sumPaisa(values: string[]): number {
  return values.reduce((total, v) => total + toPaisa(v), 0);
}
