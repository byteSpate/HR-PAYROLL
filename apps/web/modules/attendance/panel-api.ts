import type { ShiftInput, ShiftView, ShiftWriteResult } from '@erp/contracts/attendance';
import { api } from '@/lib/api-client';

// The settings panel copied from HR-MNG-V1 threads an access token through every call. The shared
// client already attaches it, so these keep HR's signatures and ignore the first argument.
export const listShifts = (_accessToken: string) => api.request<ShiftView[]>('/attendance/shifts');
export const createShift = (_accessToken: string, input: ShiftInput) => api.request<ShiftView>('/attendance/shifts', { method: 'POST', body: input });
export const updateShift = (_accessToken: string, id: string, input: ShiftInput) =>
  api.request<ShiftWriteResult>(`/attendance/shifts/${id}`, { method: 'PATCH', body: input });
export const deleteShift = (_accessToken: string, id: string) => api.request<void>(`/attendance/shifts/${id}`, { method: 'DELETE' });
