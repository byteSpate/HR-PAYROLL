import { dec, round2, ZERO, type Money } from '@erp/db';

export interface DepreciableAsset {
  id: string;
  assetTag: string;
  purchaseDate: Date;
  /** The BDT cost frozen at capitalisation. */
  purchaseCostBdt: Money;
  capitalisedAt: Date | null;
  /** Percent a year of the book value at the start of the financial year. */
  rate: Money;
  /** The month of disposal is still charged in full; the month after is not. */
  stoppedAt: Date | null;
}

export interface PriorCharge {
  assetId: string;
  year: number;
  month: number;
  amount: Money;
}

export interface ComputedCharge {
  assetId: string;
  amount: Money;
  openingBookValue: Money;
  rate: Money;
  months: number;
}

const HUNDRED = dec(100);
const TWELVE = dec(12);

const indexOf = (year: number, month: number) => year * 12 + (month - 1);
const indexOfDate = (d: Date) => indexOf(d.getUTCFullYear(), d.getUTCMonth() + 1);

/** The first month of the financial year that `index` falls in. */
function fyStartIndex(index: number, fyStartMonth: number): number {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return month >= fyStartMonth ? indexOf(year, fyStartMonth) : indexOf(year - 1, fyStartMonth);
}

/**
 * What each depreciable asset is charged for the target month: the monthly twelfth of the yearly rate applied
 * to the book value at the start of that financial year, so each year is charged on what is left, not on cost.
 * Charging runs from the month of purchase, and a late capitalisation catches up every month it missed in the
 * first run that follows, re-basing at each year boundary it crosses. Nothing is ever charged below zero, and
 * a fully depreciated asset has no row. Pure: the tests need no database.
 */
export function computeCharges(
  assets: DepreciableAsset[],
  prior: PriorCharge[],
  target: { year: number; month: number },
  fyStartMonth: number,
): ComputedCharge[] {
  const targetIndex = indexOf(target.year, target.month);
  const byAsset = new Map<string, PriorCharge[]>();
  for (const p of prior) byAsset.set(p.assetId, [...(byAsset.get(p.assetId) ?? []), p]);

  const charges: ComputedCharge[] = [];
  for (const asset of assets) {
    if (!asset.capitalisedAt) continue;

    const priors = byAsset.get(asset.id) ?? [];
    const priorTotal = priors.reduce((t, p) => t.plus(p.amount), ZERO);
    const remaining = asset.purchaseCostBdt.minus(priorTotal);
    if (remaining.lessThanOrEqualTo(ZERO)) continue;

    const lastCharged = priors.length
      ? Math.max(...priors.map((p) => indexOf(p.year, p.month)))
      : null;
    const startIndex = lastCharged !== null ? lastCharged + 1 : indexOfDate(asset.purchaseDate);
    const endIndex = asset.stoppedAt
      ? Math.min(targetIndex, indexOfDate(asset.stoppedAt))
      : targetIndex;
    if (startIndex > endIndex) continue;

    let total = ZERO;
    let currentFy: number | null = null;
    let monthly = ZERO;
    let months = 0;
    let openingForRun: Money | null = null;

    for (let i = startIndex; i <= endIndex; i++) {
      const fy = fyStartIndex(i, fyStartMonth);
      if (fy !== currentFy) {
        currentFy = fy;
        const chargedBeforeThisFy = priors
          .filter((p) => indexOf(p.year, p.month) < fy)
          .reduce((t, p) => t.plus(p.amount), ZERO)
          .plus(i > startIndex ? total : ZERO);
        const opening = asset.purchaseCostBdt.minus(chargedBeforeThisFy);
        openingForRun ??= opening;
        monthly = round2(opening.times(asset.rate).dividedBy(HUNDRED).dividedBy(TWELVE));
      }
      total = total.plus(monthly);
      months += 1;
    }

    const amount = total.greaterThan(remaining) ? remaining : total;
    if (amount.lessThanOrEqualTo(ZERO)) continue;
    charges.push({
      assetId: asset.id,
      amount: round2(amount),
      openingBookValue: openingForRun ?? remaining,
      rate: asset.rate,
      months,
    });
  }
  return charges;
}
