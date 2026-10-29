import type { AssetCondition, AssetLifecycle } from '@erp/db';
import type { AssetComputedStatus } from '@erp/contracts/asset';

export type { AssetComputedStatus };

export interface HeldBy {
  assignmentId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  assignedAt: Date;
  conditionOut: AssetCondition;
  acknowledgedAt: Date | null;
}

export interface StatusInput {
  lifecycle: AssetLifecycle;
  /** The open assignment, if any. Null when nobody is holding it. */
  openAssignment: HeldBy | null;
  hasOpenRepair: boolean;
}
