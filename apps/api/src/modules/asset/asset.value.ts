import type { AssetValueReport, AssetValueRow } from '@erp/contracts/asset';
import { dec, prisma, sum } from '@erp/db';
import { formatDateOnly, officeToday } from '@erp/export';

/**
 * Book value per asset and across the register. Book value is the frozen BDT cost minus the charges of posted
 * runs up to the date asked for; nothing here re-derives it from a formula. A USD asset's BDT figure is the one
 * frozen at capitalisation, never a live conversion. What cannot be valued is shown as unknown and left out of
 * the totals, since zero and "we do not know" are different answers.
 */
export async function assetValueReport(query: {
  asOf?: string | undefined;
  categoryId?: string | undefined;
}): Promise<AssetValueReport> {
  const asOf = query.asOf ?? formatDateOnly(officeToday());
  const asOfIndex = Number(asOf.slice(0, 4)) * 12 + Number(asOf.slice(5, 7)) - 1;
  const dayAfter = new Date(Date.parse(`${asOf}T00:00:00Z`) + 86_400_000);
  const assets = await prisma.asset.findMany({
    // Gone before the date asked for means off the register that day: neither retired nor lost assets keep a value.
    where: {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      OR: [{ retiredAt: null }, { retiredAt: { gte: dayAfter } }],
    },
    orderBy: { assetTag: 'asc' },
    select: {
      id: true,
      assetTag: true,
      name: true,
      currency: true,
      purchaseCostBdt: true,
      fxRateToBdt: true,
      capitalisedAt: true,
      category: { select: { name: true } },
    },
  });
  const charges = assets.length
    ? await prisma.assetDepreciation.findMany({
        where: { assetId: { in: assets.map((a) => a.id) }, run: { status: 'POSTED' } },
        select: { assetId: true, amount: true, run: { select: { year: true, month: true } } },
      })
    : [];
  const accumulatedBy = new Map<string, ReturnType<typeof dec>>();
  for (const c of charges) {
    if (c.run.year * 12 + c.run.month - 1 > asOfIndex) continue;
    accumulatedBy.set(c.assetId, (accumulatedBy.get(c.assetId) ?? dec(0)).plus(c.amount));
  }

  const rows: AssetValueRow[] = assets.map((a) => {
    const base = {
      assetId: a.id,
      assetTag: a.assetTag,
      name: a.name,
      categoryName: a.category.name,
      currency: a.currency,
    };
    if (!a.capitalisedAt || a.capitalisedAt >= dayAfter)
      return {
        ...base,
        purchaseCost: null,
        accumulated: null,
        bookValue: null,
        status: 'NOT_CAPITALISED',
      };
    if (a.purchaseCostBdt === null || a.fxRateToBdt === null)
      return { ...base, purchaseCost: null, accumulated: null, bookValue: null, status: 'UNKNOWN' };
    const accumulated = accumulatedBy.get(a.id) ?? dec(0);
    return {
      ...base,
      purchaseCost: a.purchaseCostBdt.toFixed(2),
      accumulated: accumulated.toFixed(2),
      bookValue: a.purchaseCostBdt.minus(accumulated).toFixed(2),
      status: 'VALUED',
    };
  });

  const valued = rows.filter(
    (r): r is AssetValueRow & { purchaseCost: string; accumulated: string; bookValue: string } =>
      r.status === 'VALUED',
  );
  const totals = [...new Set(valued.map((r) => r.currency))].sort().map((currency) => {
    const list = valued.filter((r) => r.currency === currency);
    return {
      currency,
      purchaseCost: sum(list.map((r) => dec(r.purchaseCost))).toFixed(2),
      accumulated: sum(list.map((r) => dec(r.accumulated))).toFixed(2),
      bookValue: sum(list.map((r) => dec(r.bookValue))).toFixed(2),
    };
  });
  return { rows, totals, asOf };
}
