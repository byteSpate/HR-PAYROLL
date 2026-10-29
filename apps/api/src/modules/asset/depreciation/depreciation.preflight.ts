import type { DepreciationPreflight, DepreciationPreflightItem } from '@erp/contracts/asset';
import { prisma, type Tx } from '@erp/db';
import { MS_PER_DAY } from '@erp/export';

const monthIndexOf = (year: number, month: number) => year * 12 + (month - 1);

/**
 * What stands in the way of a depreciation run for a month, and what to double-check. Blockers stop the
 * draft; warnings only ask for a look. Read-only.
 */
export async function depreciationPreflight(
  query: { year: number; month: number },
  db: Tx | typeof prisma = prisma,
): Promise<DepreciationPreflight> {
  const blockers: DepreciationPreflightItem[] = [];
  const warnings: DepreciationPreflightItem[] = [];
  const target = monthIndexOf(query.year, query.month);

  // Each month's charge builds on the ones before it, so a draft left behind would be charged over again by the next run.
  const live = await db.depreciationRun.findMany({
    where: { status: { not: 'REVERSED' } },
    select: { runNo: true, year: true, month: true, status: true },
  });
  for (const run of live) {
    const index = monthIndexOf(run.year, run.month);
    if (index < target && run.status === 'DRAFT')
      blockers.push({
        code: 'EARLIER_UNPOSTED',
        message: `${run.runNo} for ${run.month}/${run.year} is still a draft. Post or delete it before running a later month.`,
      });
    // A later run already charged these months; drafting beneath it would charge them a second time.
    if (index > target)
      blockers.push({
        code: 'LATER_RUN_EXISTS',
        message: `${run.runNo} for ${run.month}/${run.year} already covers a later month. Reverse or delete it before running an earlier one.`,
      });
  }

  const assets = await db.asset.findMany({
    where: {
      category: { isConsumable: false },
      OR: [{ capitalisedAt: { not: null } }, { purchaseDate: { not: null } }],
    },
    select: {
      assetTag: true,
      purchaseDate: true,
      purchaseCostBdt: true,
      purchaseCost: true,
      capitalisedAt: true,
      category: { select: { code: true, depreciationRate: true } },
    },
  });

  const capitalised = assets.filter((a) => a.capitalisedAt);
  for (const code of new Set(
    capitalised.filter((a) => !a.category.depreciationRate).map((a) => a.category.code),
  )) {
    blockers.push({
      code: 'NO_RATE',
      message: `${code} has no depreciation rate. Set one in Asset categories before drafting a run: depreciation will not file a nil charge.`,
    });
  }

  const now = Date.now();
  for (const asset of assets) {
    if (asset.capitalisedAt && asset.purchaseCostBdt === null) {
      warnings.push({
        code: 'NO_COST',
        message: `${asset.assetTag} has no frozen cost, so it cannot be depreciated and will be absent from the run.`,
      });
    }
    if (
      !asset.capitalisedAt &&
      asset.purchaseDate &&
      asset.purchaseCost !== null &&
      (now - asset.purchaseDate.getTime()) / MS_PER_DAY > 60
    ) {
      warnings.push({
        code: 'UNCAPITALISED',
        message: `${asset.assetTag} has not been capitalised for more than 60 days.`,
      });
    }
    if (asset.capitalisedAt && asset.purchaseDate) {
      const months =
        target -
        monthIndexOf(asset.purchaseDate.getUTCFullYear(), asset.purchaseDate.getUTCMonth() + 1);
      if (
        months > 3 &&
        !(await db.assetDepreciation.count({ where: { asset: { assetTag: asset.assetTag } } }))
      ) {
        warnings.push({
          code: 'LONG_CATCHUP',
          message: `${asset.assetTag} will be charged for ${months} months in one run. Check the number before posting.`,
        });
      }
    }
  }
  return { blockers, warnings, ok: blockers.length === 0 };
}
