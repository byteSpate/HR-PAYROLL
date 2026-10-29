import { api } from '@/lib/api-client';
import type {
  AdjustmentInput,
  BankFileManifest,
  BankFileSummary,
  Currency,
  EmailStatus,
  PayrollAdjustment,
  PayrollRun,
  PayrollSettings,
  Payslip,
  SalaryStructure,
  SalaryStructureInput,
} from './types';

// The screens copied from HR-MNG-V1 thread an access token through every call. The shared client already
// attaches it, so these keep the original's signatures and ignore the first argument.

const send = <T>(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) =>
  api.request<T>(path, { method, ...(body === undefined ? {} : { body }) });

export const getPayrollSettings = (_t: string) => api.request<PayrollSettings>('/payroll/settings');
export const updatePayrollSettings = (_t: string, input: Partial<PayrollSettings>) =>
  send<PayrollSettings>('PATCH', '/payroll/settings', input);

export const listSalaryStructures = (_t: string) => api.request<SalaryStructure[]>('/payroll/salary-structures');
export const createSalaryStructure = (_t: string, input: SalaryStructureInput) =>
  send<SalaryStructure>('POST', '/payroll/salary-structures', input);
export const updateSalaryStructure = (_t: string, id: string, input: SalaryStructureInput) =>
  send<SalaryStructure>('PATCH', `/payroll/salary-structures/${id}`, input);
export const deleteSalaryStructure = (_t: string, id: string) =>
  send<{ id: string }>('DELETE', `/payroll/salary-structures/${id}`);

export const listPayrollRuns = (_t: string) => api.request<PayrollRun[]>('/payroll/runs');
export const getPayrollRun = (_t: string, id: string) => api.request<PayrollRun>(`/payroll/runs/${id}`);
export const createPayrollRun = (_t: string, input: { month: number; year: number; notes?: string }) =>
  send<PayrollRun>('POST', '/payroll/runs', input);
export const processPayrollRun = (_t: string, id: string, excludedEmployeeIds?: string[]) =>
  send<PayrollRun>('POST', `/payroll/runs/${id}/process`, excludedEmployeeIds ? { excludedEmployeeIds } : {});
export const deletePayrollRun = (_t: string, id: string) => send<unknown>('DELETE', `/payroll/runs/${id}`);
const runAction = (action: 'submit' | 'approve' | 'disburse') => (_t: string, id: string) =>
  send<PayrollRun>('POST', `/payroll/runs/${id}/${action}`);
export const submitPayrollRun = runAction('submit');
export const approvePayrollRun = runAction('approve');
export const disbursePayrollRun = runAction('disburse');
export const rejectPayrollRun = (_t: string, id: string, note: string) =>
  send<PayrollRun>('POST', `/payroll/runs/${id}/reject`, { note });

export const getMyPayslips = (_t: string) => api.request<Payslip[]>('/payroll/payslips/me');
export const getEmployeePayslips = (_t: string, employeeId: string) =>
  api.request<Payslip[]>(`/payroll/payslips/employee/${employeeId}`);
export const getPayslip = (_t: string, id: string) => api.request<Payslip>(`/payroll/payslips/${id}`);
export async function downloadPayslipPdf(_t: string, id: string): Promise<Blob> {
  return (await api.download(`/payroll/payslips/${id}/pdf`)).blob;
}

export const listAdjustments = (_t: string, query: { month?: number; year?: number; employeeId?: string } = {}) => {
  const search = new URLSearchParams(
    Object.entries(query).filter((e): e is [string, string | number] => e[1] !== undefined).map(([k, v]) => [k, String(v)]),
  ).toString();
  return api.request<PayrollAdjustment[]>(`/payroll/adjustments${search ? `?${search}` : ''}`);
};
export const createAdjustment = (_t: string, input: AdjustmentInput) =>
  send<PayrollAdjustment>('POST', '/payroll/adjustments', input);
export const deleteAdjustment = (_t: string, id: string) => send<{ id: string }>('DELETE', `/payroll/adjustments/${id}`);

/** The CSV and its manifest, which rides in a header so a download still carries the completeness evidence. */
export async function downloadBankFile(
  _t: string,
  runId: string,
  currency: Currency,
): Promise<{ blob: Blob; manifest: BankFileManifest | null }> {
  const { blob, headers } = await api.download(`/payroll/runs/${runId}/bank-file?currency=${currency}`);
  const raw = headers.get('X-Bankfile-Manifest');
  return { blob, manifest: raw ? (JSON.parse(raw) as BankFileManifest) : null };
}
export const getBankFileSummary = (_t: string, runId: string) =>
  api.request<BankFileSummary>(`/payroll/runs/${runId}/bank-file/summary`);

export const emailPayslips = (_t: string, runId: string) =>
  send<EmailStatus>('POST', `/payroll/runs/${runId}/email`);
export const getEmailStatus = (_t: string, runId: string) => api.request<EmailStatus>(`/payroll/runs/${runId}/email-status`);
