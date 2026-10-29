import { exchangeRateBody, type ExchangeRate as ExchangeRateView } from '@erp/contracts/exchange';
import { writeAudit } from '@erp/audit';
import { dec, prisma, type ExchangeRate } from '@erp/db';
import { formatDateOnly, parseDateOnly } from '@erp/export';
import { AppError } from '@erp/utils';

const isUniqueViolation = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

const conflict = (base: string, quote: string, effectiveFrom: string) => new AppError(409, `A ${base}→${quote} rate already exists effective ${effectiveFrom}`);

const view = (r: ExchangeRate): ExchangeRateView => ({
  id: r.id,
  base: r.base,
  quote: r.quote,
  rate: r.rate.toFixed(6),
  effectiveFrom: formatDateOnly(r.effectiveFrom),
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
});

// What the audit row records: the facts of the rate, not its identity or bookkeeping columns.
const snapshot = (r: ExchangeRate) => ({ base: r.base, quote: r.quote, rate: r.rate.toFixed(6), effectiveFrom: formatDateOnly(r.effectiveFrom) });

export async function listExchangeRates(): Promise<ExchangeRateView[]> {
  const rows = await prisma.exchangeRate.findMany({ orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] });
  return rows.map(view);
}

export async function createExchangeRate(actorId: string, input: unknown): Promise<ExchangeRateView> {
  const body = exchangeRateBody.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.exchangeRate.create({ data: { base: body.base, quote: body.quote, rate: dec(body.rate), effectiveFrom: parseDateOnly(body.effectiveFrom), createdBy: actorId } });
      await writeAudit(tx, { entity: 'EXCHANGE_RATE', entityId: row.id, action: 'CREATE', changedBy: actorId, after: snapshot(row) });
      return view(row);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(body.base, body.quote, body.effectiveFrom);
    throw err;
  }
}

/**
 * Editing a rate row is allowed and audited, and it cannot corrupt history: every claim, payslip and
 * settlement freezes the rate value it used, not a reference to this row.
 */
export async function updateExchangeRate(id: string, actorId: string, input: unknown): Promise<ExchangeRateView> {
  const body = exchangeRateBody.parse(input);
  const existing = await prisma.exchangeRate.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Exchange rate not found');
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.exchangeRate.update({ where: { id }, data: { base: body.base, quote: body.quote, rate: dec(body.rate), effectiveFrom: parseDateOnly(body.effectiveFrom) } });
      await writeAudit(tx, { entity: 'EXCHANGE_RATE', entityId: id, action: 'UPDATE', changedBy: actorId, before: snapshot(existing), after: snapshot(row) });
      return view(row);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(body.base, body.quote, body.effectiveFrom);
    throw err;
  }
}
