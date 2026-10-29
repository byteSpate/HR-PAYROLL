import { z } from 'zod';

export const currencies = ['BDT', 'USD'] as const;
export type Currency = (typeof currencies)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const exchangeRateBody = z
  .object({
    base: z.enum(currencies),
    quote: z.enum(currencies),
    rate: z.coerce.number().positive('rate must be greater than 0'),
    effectiveFrom: dateOnly,
  })
  .refine((r) => r.base !== r.quote, { message: 'base and quote must be different currencies', path: ['quote'] });

export type ExchangeRateBody = z.infer<typeof exchangeRateBody>;
