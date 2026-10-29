import { disposeAssetBody, payAssetBody } from '@erp/contracts/asset';
import { writeAudit } from '@erp/audit';
import { dec, prisma, round2, ZERO } from '@erp/db';
import { emit } from '@erp/events';
import { formatDateOnly, officeToday, parseDateOnly } from '@erp/export';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { resolveRateOrThrow } from '../exchange/exchange.fx.js';
import { lockAsset } from './asset.lock.js';
import { presentAsset } from './asset.service.js';

// Capitalising, paying for and disposing of an asset keep their state change and announce the money side as an
// event, since the books live outside this module. HR fills the register and whoever holds `asset.capitalise`
// moves cost onto the balance sheet: a bulk import can create hundreds of rows at once, and registering one is
// not the same decision as putting it on the books.

/**
 * The explicit act that puts an asset on the balance sheet. The rate is frozen on the asset here, so the
 * acquisition and every later depreciation charge can never convert at different rates. A consumable is
 * expensed, not capitalised, so there is nothing to record and depreciation skips it.
 */
export async function capitaliseAsset(viewer: Viewer, id: string) {
  return prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, id);
    if (asset.category.isConsumable)
      throw new AppError(
        409,
        `${asset.assetTag} is a consumable, so it is expensed rather than capitalised.`,
      );
    if (asset.purchaseCost === null || asset.purchaseDate === null)
      throw new AppError(
        400,
        `${asset.assetTag} has no purchase cost or purchase date, so it cannot be capitalised.`,
      );
    if (asset.capitalisedAt)
      throw new AppError(
        409,
        `${asset.assetTag} was already capitalised. Reverse that in the books before changing it.`,
      );

    const capitalisedOn = officeToday();
    // Stops with a 409 naming the currency and date when no rate covers today; never assumes one.
    const rate = await resolveRateOrThrow(asset.currency, capitalisedOn);
    const purchaseCostBdt = round2(asset.purchaseCost.times(rate));

    await tx.asset.update({
      where: { id },
      data: {
        capitalisedAt: new Date(),
        capitalisedBy: viewer.sub,
        fxRateToBdt: rate,
        purchaseCostBdt,
      },
    });
    await writeAudit(tx, {
      entity: 'ASSET',
      entityId: id,
      action: 'CAPITALISE',
      changedBy: viewer.sub,
      after: { purchaseCostBdt: purchaseCostBdt.toFixed(2), fxRateToBdt: rate.toFixed(6) },
    });
    await emit(tx, 'asset.capitalised', {
      assetId: id,
      assetTag: asset.assetTag,
      assetName: asset.name,
      categoryCode: asset.category.code,
      departmentId: asset.departmentId,
      currency: asset.currency,
      purchaseCost: asset.purchaseCost.toFixed(2),
      fxRateToBdt: rate.toFixed(6),
      purchaseCostBdt: purchaseCostBdt.toFixed(2),
      capitalisedOn: formatDateOnly(capitalisedOn),
      actorUserId: viewer.sub,
    });
    return presentAsset(tx, viewer, id);
  });
}

/** Records that the purchase has been paid for, once. Refused on an asset never capitalised: nothing was owed to pay. */
export async function payForAsset(viewer: Viewer, id: string, input: unknown) {
  const body = payAssetBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, id);
    if (!asset.capitalisedAt || asset.purchaseCostBdt === null)
      throw new AppError(
        409,
        `${asset.assetTag} has not been capitalised yet, so there is nothing to pay.`,
      );
    if (asset.paidAt) throw new AppError(409, `${asset.assetTag} has already been paid for.`);

    const paidAt = body.paidAt ? parseDateOnly(body.paidAt) : new Date();
    await tx.asset.update({ where: { id }, data: { paidAt, paidBy: viewer.sub } });
    await writeAudit(tx, {
      entity: 'ASSET',
      entityId: id,
      action: 'PAY',
      changedBy: viewer.sub,
      after: { paidOn: formatDateOnly(paidAt) },
    });
    await emit(tx, 'asset.paid', {
      assetId: id,
      assetTag: asset.assetTag,
      assetName: asset.name,
      purchaseCostBdt: asset.purchaseCostBdt.toFixed(2),
      paidOn: formatDateOnly(paidAt),
      actorUserId: viewer.sub,
    });
    return presentAsset(tx, viewer, id);
  });
}

/**
 * Retiring an asset without telling the books leaves cost and depreciation on the balance sheet for good.
 * This retires it and announces the figures a disposal entry needs. Refused on one never capitalised, one
 * already disposed of, and one somebody holds: unlike the leaver's checklist that last is a hard block,
 * since disposing of a laptop someone is still holding is a data error, not a debt.
 */
export async function disposeAsset(viewer: Viewer, id: string, input: unknown) {
  const body = disposeAssetBody.parse(input);
  return prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, id);
    if (!asset.capitalisedAt || asset.purchaseCostBdt === null)
      throw new AppError(
        409,
        `${asset.assetTag} was never capitalised, so there is nothing to dispose of.`,
      );
    if (asset.lifecycle === 'RETIRED')
      throw new AppError(409, `${asset.assetTag} has already been disposed of.`);
    const holder = await tx.assetAssignment.findFirst({
      where: { assetId: id, returnedAt: null },
      include: { employee: { select: { fullName: true, employeeCode: true } } },
    });
    if (holder)
      throw new AppError(
        409,
        `Take the asset back from ${holder.employee.fullName} (${holder.employee.employeeCode}) before disposing of it.`,
      );

    const { _sum } = await tx.assetDepreciation.aggregate({
      where: { assetId: id, run: { status: 'POSTED' } },
      _sum: { amount: true },
    });
    const accumulated = _sum.amount ?? ZERO;
    const proceeds = body.proceeds === undefined ? ZERO : round2(dec(body.proceeds));
    const bookValue = asset.purchaseCostBdt.minus(accumulated);
    // Positive is a gain: what it fetched beyond what the books said it was worth.
    const gainLoss = proceeds.minus(bookValue);

    await tx.asset.update({
      where: { id },
      data: {
        lifecycle: 'RETIRED',
        retiredAt: new Date(),
        retiredBy: viewer.sub,
        retirementNote: body.note ?? null,
      },
    });
    await writeAudit(tx, {
      entity: 'ASSET',
      entityId: id,
      action: 'RETIRE',
      changedBy: viewer.sub,
      before: { lifecycle: asset.lifecycle },
      after: { lifecycle: 'RETIRED', proceeds: proceeds.toFixed(2), gainLoss: gainLoss.toFixed(2) },
      note: body.note ?? null,
    });
    await emit(tx, 'asset.disposed', {
      assetId: id,
      assetTag: asset.assetTag,
      assetName: asset.name,
      categoryCode: asset.category.code,
      departmentId: asset.departmentId,
      purchaseCostBdt: asset.purchaseCostBdt.toFixed(2),
      accumulatedBdt: accumulated.toFixed(2),
      bookValueBdt: bookValue.toFixed(2),
      proceedsBdt: proceeds.toFixed(2),
      gainLossBdt: gainLoss.toFixed(2),
      actorUserId: viewer.sub,
    });
    return presentAsset(tx, viewer, id);
  });
}
