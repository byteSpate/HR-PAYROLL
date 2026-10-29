import { api } from '@/lib/api-client';
import type { ExitDetailsInput, Settlement, SettlementOverrideInput } from './types';

// Keeps the original's signatures; the shared client already attaches the token, so the first argument is ignored.

const send = <T>(method: 'POST' | 'PATCH', path: string, body?: unknown) =>
  api.request<T>(path, { method, ...(body === undefined ? {} : { body }) });

export const listSettlements = (_t: string) => api.request<Settlement[]>('/settlements');
export const calculateSettlement = (_t: string, employeeId: string) =>
  send<Settlement>('POST', `/settlements/${employeeId}/calculate`);
export const overrideSettlement = (_t: string, id: string, input: SettlementOverrideInput) =>
  send<Settlement>('PATCH', `/settlements/id/${id}`, input);
export const approveSettlement = (_t: string, id: string) => send<Settlement>('POST', `/settlements/id/${id}/approve`);
export const rejectSettlement = (_t: string, id: string, note: string) =>
  send<Settlement>('POST', `/settlements/id/${id}/reject`, { note });
export const paySettlement = (_t: string, id: string) => send<Settlement>('POST', `/settlements/id/${id}/pay`);

/** Records the exit facts a settlement is computed from. */
export const setExitDetails = (_t: string, employeeId: string, input: ExitDetailsInput) =>
  send<{ id: string }>('PATCH', `/employees/${employeeId}/exit`, input);
