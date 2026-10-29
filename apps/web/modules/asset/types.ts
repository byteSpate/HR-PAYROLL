// The wire types live in @erp/contracts so the API and these screens cannot drift. The names the screens were
// written against are kept as aliases.
import type {
  AssignBody,
  CreateAssetBody,
  CategoryBody,
  CreateRecoveryBody,
  LifecycleBody,
  ReceiveRepairBody,
  ReturnBody,
  SendRepairBody,
  SubmitRequestBody,
  UpdateCategoryBody,
  UpdateRecoveryBody,
} from '@erp/contracts/asset';

export type * from '@erp/contracts/asset';
export type { Currency } from '@erp/contracts/exchange';
export type { EmployeeView } from '@erp/contracts/employee';

export type CreateAssetInput = CreateAssetBody;
export type UpdateAssetInput = Partial<CreateAssetBody>;
export type AssetLifecycleInput = LifecycleBody;
export type CreateAssetCategoryInput = CategoryBody;
export type UpdateAssetCategoryInput = UpdateCategoryBody;
export type AssignAssetInput = AssignBody;
export type ReturnAssetInput = ReturnBody;
export type SendAssetRepairInput = SendRepairBody;
export type ReceiveAssetRepairInput = ReceiveRepairBody;
export type SubmitAssetRequestInput = SubmitRequestBody;
export type CreateRecoveryInput = CreateRecoveryBody;
export type UpdateRecoveryInput = UpdateRecoveryBody;
export interface ApproveAssetRequestInput {
  note?: string;
}
export interface RejectAssetRequestInput {
  note: string;
}
export interface FulfilAssetRequestInput {
  assetId?: string;
  note?: string;
}
