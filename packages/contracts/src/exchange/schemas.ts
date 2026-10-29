import { z } from 'zod';
import { positiveDecimal } from '../decimal.js';

export const currencies = ['BDT', 'USD'] as const;
export type Currency = (typeof currencies)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const exchangeRateBody = z
  .object({
    base: z.enum(currencies),
    quote: z.enum(currencies),
    // ExchangeRate.rate is Decimal(18,6).
    rate: positiveDecimal('rate', 12, 6),
    effectiveFrom: dateOnly,
  })
  .refine((r) => r.base !== r.quote, { message: 'base and quote must be different currencies', path: ['quote'] });

export type ExchangeRateBody = z.infer<typeof exchangeRateBody>;
