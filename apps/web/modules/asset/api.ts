import { api } from '@/lib/api-client';
import type { DepreciationPreflight, DepreciationRunDetail, DepreciationRunSummary } from './types';
import { listEmployees as listAllEmployees } from '@/modules/employee/api';

export const listEmployees = (_t: string) => listAllEmployees();

import type {
  ApproveAssetRequestInput,
  Asset,
  AssetLifecycleInput,
  RejectAssetRequestInput,
  AssetAssignment,
  AssetAttachment,
  AssetAttachmentKind,
  AssetCategory,
  AssetDetail,
  AssetImportCommitResult,
  AssetImportPreview,
  AssetRecovery,
  AssetRepair,
  AssetRequest,
  AssetRequestTimelineEntry,
  AssetValueReport,
  AssignAssetInput,
  CreateAssetCategoryInput,
  CreateAssetInput,
  CreateRecoveryInput,
  ExitChecklist,
  FulfilAssetRequestInput,
  ReceiveAssetRepairInput,
  ReturnAssetInput,
  SendAssetRepairInput,
  SubmitAssetRequestInput,
  UpdateAssetCategoryInput,
  UpdateAssetInput,
  UpdateRecoveryInput,
} from './types';

// The screens copied from HR-MNG-V1 thread an access token through every call. The shared client already
// attaches it, so these keep the original's signatures and ignore the first argument. HR-MNG-V1 decides
// and transitions with PATCH; this API uses POST.

export interface SignedDocumentUrl {
  url: string;
  expiresAt: string;
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(
    Object.entries(params).filter((e): e is [string, string] => !!e[1]),
  ).toString();
  return search ? `?${search}` : '';
};
const post = <T>(path: string, body?: unknown) => api.request<T>(path, { method: 'POST', body });

export const listAssets = (
  _t: string,
  filter: { status?: string; categoryId?: string; departmentId?: string; q?: string } = {},
) => api.request<Asset[]>(`/assets${query(filter)}`);
export const getAsset = (_t: string, id: string) => api.request<AssetDetail>(`/assets/${id}`);
export const createAsset = (_t: string, input: CreateAssetInput) => post<Asset>('/assets', input);
export const updateAsset = (_t: string, id: string, input: UpdateAssetInput) =>
  api.request<Asset>(`/assets/${id}`, { method: 'PATCH', body: input });
export const retireAsset = (_t: string, id: string, input: AssetLifecycleInput) =>
  post<Asset>(`/assets/${id}/retire`, input);
export const markAssetLost = (_t: string, id: string, input: AssetLifecycleInput) =>
  post<Asset>(`/assets/${id}/mark-lost`, input);
export const assignAsset = (_t: string, id: string, input: AssignAssetInput) =>
  post<AssetAssignment>(`/assets/${id}/assign`, input);
export const returnAsset = (_t: string, id: string, input: ReturnAssetInput) =>
  post<AssetAssignment>(`/assets/${id}/return`, input);
export const acknowledgeAssignment = (_t: string, assignmentId: string) =>
  post<AssetAssignment>(`/assets/assignments/${assignmentId}/acknowledge`);
export const getMyHoldings = (_t: string) => api.request<AssetAssignment[]>('/assets/me');
export const listUnacknowledged = (_t: string) =>
  api.request<AssetAssignment[]>('/assets/unacknowledged');

export const listCategories = (_t: string) => api.request<AssetCategory[]>('/assets/categories');
export const createCategory = (_t: string, input: CreateAssetCategoryInput) =>
  post<AssetCategory>('/assets/categories', input);
export const updateCategory = (_t: string, id: string, input: UpdateAssetCategoryInput) =>
  api.request<AssetCategory>(`/assets/categories/${id}`, { method: 'PATCH', body: input });
export const deleteCategory = (_t: string, id: string) =>
  api.request<void>(`/assets/categories/${id}`, { method: 'DELETE' });

export const submitAssetRequest = (_t: string, input: SubmitAssetRequestInput) =>
  post<AssetRequest>('/assets/requests', input);
export const listAssetRequests = (_t: string) => api.request<AssetRequest[]>('/assets/requests');
export const approveAssetRequest = (_t: string, id: string, input: ApproveAssetRequestInput = {}) =>
  post<AssetRequest>(`/assets/requests/${id}/approve`, input);
export const rejectAssetRequest = (_t: string, id: string, input: RejectAssetRequestInput) =>
  post<AssetRequest>(`/assets/requests/${id}/reject`, input);
export const markAssetRequestOrdered = (
  _t: string,
  id: string,
  input: { expectedBy?: string; note?: string } = {},
) => post<AssetRequest>(`/assets/requests/${id}/order`, input);
export const getAssetRequestTimeline = (_t: string, id: string) =>
  api.request<AssetRequestTimelineEntry[]>(`/assets/requests/${id}/timeline`);
export const cancelAssetRequest = (_t: string, id: string, input: { note?: string } = {}) =>
  post<AssetRequest>(`/assets/requests/${id}/cancel`, input);
export const fulfilAssetRequest = (_t: string, id: string, input: FulfilAssetRequestInput) =>
  post<AssetRequest>(`/assets/requests/${id}/fulfil`, input);

export const sendForRepair = (_t: string, id: string, input: SendAssetRepairInput) =>
  post<AssetRepair>(`/assets/${id}/repairs`, input);
export const receiveFromRepair = (_t: string, repairId: string, input: ReceiveAssetRepairInput) =>
  post<AssetRepair>(`/assets/repairs/${repairId}/receive`, input);
export const listRepairs = (_t: string, filter: { open?: boolean } = {}) =>
  api.request<AssetRepair[]>(`/assets/repairs${query({ open: filter.open ? 'true' : undefined })}`);

const upload = <T>(path: string, kind: AssetAttachmentKind, file: File) => {
  const body = new FormData();
  body.append('kind', kind);
  body.append('file', file);
  return api.request<T>(path, { method: 'POST', body });
};
export const uploadAssetAttachment = (
  _t: string,
  assetId: string,
  kind: AssetAttachmentKind,
  file: File,
) => upload<AssetAttachment>(`/assets/${assetId}/attachments`, kind, file);
export const uploadAssignmentAttachment = (
  _t: string,
  assignmentId: string,
  kind: 'CONDITION_OUT' | 'CONDITION_IN',
  file: File,
) => upload<AssetAttachment>(`/assets/assignments/${assignmentId}/attachments`, kind, file);
export const getAttachmentUrl = (_t: string, id: string) =>
  api.request<SignedDocumentUrl>(`/assets/attachments/${id}/url`);
export const deleteAttachment = (_t: string, id: string) =>
  api.request<void>(`/assets/attachments/${id}`, { method: 'DELETE' });

const sheet = <T>(path: string, file: File) => {
  const body = new FormData();
  body.append('file', file);
  return api.request<T>(path, { method: 'POST', body });
};
export const previewAssetImport = (_t: string, file: File) =>
  sheet<AssetImportPreview>('/assets/import/preview', file);
export const commitAssetImport = (_t: string, file: File) =>
  sheet<AssetImportCommitResult>('/assets/import/commit', file);

export const capitaliseAsset = (_t: string, id: string) => post<Asset>(`/assets/${id}/capitalise`);
export const payForAsset = (_t: string, id: string, input: { paidAt?: string } = {}) =>
  post<Asset>(`/assets/${id}/pay`, input);
export const disposeAsset = (
  _t: string,
  id: string,
  input: { proceeds?: string; note?: string } = {},
) => post<Asset>(`/assets/${id}/dispose`, input);

export const listRecoveries = (
  _t: string,
  filter: { employeeId?: string; assetId?: string; status?: string } = {},
) => api.request<AssetRecovery[]>(`/assets/recoveries${query(filter)}`);
export const createRecovery = (_t: string, input: CreateRecoveryInput) =>
  post<AssetRecovery>('/assets/recoveries', input);
export const updateRecovery = (_t: string, id: string, input: UpdateRecoveryInput) =>
  api.request<AssetRecovery>(`/assets/recoveries/${id}`, { method: 'PATCH', body: input });
export const waiveRecovery = (_t: string, id: string, waiverReason: string) =>
  post<AssetRecovery>(`/assets/recoveries/${id}/waive`, { waiverReason });
export const getExitChecklist = (_t: string, employeeId: string) =>
  api.request<ExitChecklist>(`/assets/exit-checklist/${employeeId}`);

export const getAssetValueReport = (
  _t: string,
  filter: { asOf?: string; categoryId?: string } = {},
) => api.request<AssetValueReport>(`/assets/value${query(filter)}`);

export const listDepreciationRuns = (_t: string, filter: { year?: number; status?: string } = {}) =>
  api.request<DepreciationRunSummary[]>(
    `/depreciation${query({ year: filter.year === undefined ? undefined : String(filter.year), status: filter.status })}`,
  );
export const getDepreciationRun = (_t: string, id: string) =>
  api.request<DepreciationRunDetail>(`/depreciation/${id}`);
export const draftDepreciationRun = (_t: string, input: { year: number; month: number }) =>
  post<DepreciationRunDetail>('/depreciation', input);
export const postDepreciationRun = (_t: string, id: string) =>
  post<DepreciationRunDetail>(`/depreciation/${id}/post`);
export const reverseDepreciationRun = (_t: string, id: string, reason: string) =>
  post<DepreciationRunDetail>(`/depreciation/${id}/reverse`, { reason });
export const deleteDepreciationRun = (_t: string, id: string) =>
  api.request<void>(`/depreciation/${id}`, { method: 'DELETE' });
export const getDepreciationPreflight = (_t: string, input: { year: number; month: number }) =>
  api.request<DepreciationPreflight>(
    `/depreciation/preflight${query({ year: String(input.year), month: String(input.month) })}`,
  );
