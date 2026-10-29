// The wire types live in @erp/contracts so the API and these screens cannot drift.
import type { CostImportPreview } from '@erp/contracts/cost';
import type { CommitmentBody, CostBody, CostCategoryBody, PayCostBody, UpdateCommitmentBody, UpdateCostBody } from '@erp/contracts/cost';

export type * from '@erp/contracts/cost';
export type { Currency } from '@erp/contracts/exchange';

export type CreateCostCategoryInput = CostCategoryBody;
export type UpdateCostCategoryInput = Partial<Omit<CostCategoryBody, 'code'>>;
export type CreateCommitmentInput = CommitmentBody;
export type UpdateCommitmentInput = UpdateCommitmentBody;
export type CreateCostInput = CostBody;
export type UpdateCostInput = UpdateCostBody;
export type PayCostInput = PayCostBody;

export type CostImportIssue = CostImportPreview['issues'][number];
