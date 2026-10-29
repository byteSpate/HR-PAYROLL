import type { ReceiveRepairBody, SendRepairBody } from '@erp/contracts/asset';
import { writeAudit } from '@erp/audit';
import { dec, prisma, round2 } from '@erp/db';
import { parseDateOnly } from '@erp/export';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { manageableAssets } from './asset.access.js';
import { lockAsset, lockRepair } from './asset.lock.js';
import { assertManageable } from './asset.service.js';
import { repairView } from './asset.view.js';

// Repairs deliberately do NOT suspend custody. An open repair and an open assignment coexist because that is how
// it happens: the employee still has the machine on their record, it goes to the vendor for a week, it comes
// back to them. Forcing a return and a reissue would fabricate two custody events that never occurred, and
// keeps the person responsible for the asset responsible while it is out.
//
// `cost` is an expense and never touches book value: capitalising repairs would give a heavily repaired old
// laptop a higher book value than a new one. Repairs emit no events; the audit rows and the open-repairs list cover them.

export async function sendForRepair(viewer: Viewer, assetId: string, body: SendRepairBody) {
  await assertManageable(viewer, assetId);
  return prisma.$transaction(async (tx) => {
    const asset = await lockAsset(tx, assetId);
    if (asset.lifecycle === 'RETIRED') throw new AppError(409, 'This asset is retired');
    if (asset.lifecycle === 'LOST') throw new AppError(409, 'This asset has been marked lost');
    if (
      await tx.assetRepair.findFirst({ where: { assetId, returnedAt: null }, select: { id: true } })
    )
      throw new AppError(409, `${asset.assetTag} already has an open repair`);

    const repair = await tx.assetRepair.create({
      data: {
        assetId,
        sentAt: new Date(),
        sentBy: viewer.sub,
        vendor: body.vendor ?? null,
        fault: body.fault,
        expectedBack: body.expectedBack ? parseDateOnly(body.expectedBack) : null,
        isWarranty: body.isWarranty ?? false,
      },
    });
    await writeAudit(tx, {
      entity: 'ASSET_REPAIR',
      entityId: repair.id,
      action: 'SEND_REPAIR',
      changedBy: viewer.sub,
      after: { assetId, fault: body.fault, vendor: body.vendor ?? null },
    });
    return repairView(repair, true);
  });
}

export async function receiveFromRepair(viewer: Viewer, repairId: string, body: ReceiveRepairBody) {
  const known = await prisma.assetRepair.findUnique({
    where: { id: repairId },
    select: { assetId: true },
  });
  if (!known) throw new AppError(404, 'Repair not found');
  await assertManageable(viewer, known.assetId);
  return prisma.$transaction(async (tx) => {
    const repair = await lockRepair(tx, repairId);
    if (repair.returnedAt) throw new AppError(409, 'This repair is already closed');
    const cost = body.cost === undefined ? null : round2(dec(body.cost));

    const updated = await tx.assetRepair.update({
      where: { id: repairId },
      data: {
        returnedAt: new Date(),
        cost,
        currency: body.currency ?? 'BDT',
        outcome: body.outcome ?? null,
        conditionAfter: body.conditionAfter ?? null,
      },
    });

    // A repair request is fulfilled by the thing coming back. There may be no request behind this repair at all,
    // because an asset can still be sent for repair directly, so this reads the ones there are.
    const closing = await tx.assetRequest.findMany({
      where: { repairId, status: 'APPROVED' },
      select: { id: true },
    });
    if (closing.length > 0) {
      await tx.assetRequest.updateMany({
        where: { id: { in: closing.map((r) => r.id) } },
        data: { status: 'FULFILLED', fulfilledAt: new Date(), fulfilledBy: viewer.sub },
      });
      for (const r of closing)
        await writeAudit(tx, {
          entity: 'ASSET_REQUEST',
          entityId: r.id,
          action: 'FULFIL',
          changedBy: viewer.sub,
          after: { status: 'FULFILLED' },
        });
    }
    await writeAudit(tx, {
      entity: 'ASSET_REPAIR',
      entityId: repairId,
      action: 'RECEIVE_REPAIR',
      changedBy: viewer.sub,
      after: {
        cost: cost ? cost.toFixed(2) : null,
        outcome: body.outcome ?? null,
        conditionAfter: body.conditionAfter ?? null,
      },
    });
    return repairView(updated, true);
  });
}

export async function listRepairs(viewer: Viewer, filters: { open?: boolean } = {}) {
  const rows = await prisma.assetRepair.findMany({
    where: { asset: await manageableAssets(viewer), ...(filters.open ? { returnedAt: null } : {}) },
    include: { asset: { include: { category: true } } },
    orderBy: { sentAt: 'desc' },
  });
  return rows.map((r) => repairView(r, true));
}
