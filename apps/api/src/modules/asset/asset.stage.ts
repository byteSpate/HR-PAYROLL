import type { AssetRequestKind, AssetRequestStatus } from '@erp/db';
import type { AssetRequestStage } from '@erp/contracts/asset';

export type RequestStage = AssetRequestStage;

export interface StageInput {
  kind: AssetRequestKind;
  status: AssetRequestStatus;
  /** Null while the repair is still open. Ignored for other kinds. */
  repairReturnedAt: Date | null;
}

/**
 * What stage a request has reached, derived on read and never stored: a stored stage needs a job to keep it
 * true and drifts the moment nobody runs it. Pure, so its tests need no mocks.
 */
export function computeRequestStage(request: StageInput): RequestStage {
  switch (request.status) {
    case 'PENDING':
      return 'AWAITING_APPROVAL';
    case 'REJECTED':
      return 'REJECTED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'FULFILLED':
      return 'DONE';
    case 'ORDERED':
      return 'ORDERED';
    case 'APPROVED':
      // Approval is not completion for any kind, and what happens next differs: a repair has gone to the
      // vendor, a return waits for somebody to catch it, a new item waits to be sourced.
      if (request.kind === 'REPAIR' && request.repairReturnedAt === null) return 'IN_REPAIR';
      if (request.kind === 'RETURN') return 'AWAITING_COLLECTION';
      return 'APPROVED';
  }
}
