import { z } from 'zod';

/**
 * A positive decimal kept as the string the person wrote, checked against the column that will hold it
 * (`intDigits` before the point, `fractionDigits` after). Parsing to a float first would let 0.001
 * through and have the database round it to 0.00, so precision is refused here rather than lost there.
 * A JSON number is accepted through its shortest decimal form; one that prints with an exponent has no
 * exact decimal reading and fails the pattern.
 */
export function positiveDecimal(label: string, intDigits: number, fractionDigits: number) {
  const pattern = new RegExp(`^\\d{1,${intDigits}}(\\.\\d{1,${fractionDigits}})?$`);
  return z.preprocess(
    (value) => (typeof value === 'number' && Number.isFinite(value) ? String(value) : value),
    z
      .string()
      .trim()
      .regex(pattern, `${label} must be a number with at most ${fractionDigits} decimal places`)
      .refine((text) => /[1-9]/.test(text), `${label} must be greater than 0`),
  );
}
