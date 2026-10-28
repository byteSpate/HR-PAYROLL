import { api } from '@/lib/api-client';
export interface AttendanceRow { id: string; employeeId: string; date: string; checkIn: string | null; checkOut: string | null; workedHours: number | null; approval: string; employee?: { id: string; fullName: string; employeeCode: string } }
export const myAttendance = (month: string) => api.request<AttendanceRow[]>(`/attendance/me?month=${encodeURIComponent(month)}`);
export const punch = (action: 'check-in' | 'check-out') => api.request<void>(`/attendance/${action}`, { method: 'POST' });
export const listAttendance = (query = '') => api.request<AttendanceRow[]>(`/attendance${query}`);
export const bulkDecide = (ids: string[], decision: 'APPROVED' | 'REJECTED', note: string) => api.request<{ results: { id: string; status: number; error?: string }[] }>('/attendance/bulk-decide', { method: 'POST', body: { ids, decision, note } });
export interface GridRow { employeeId: string; employeeCode: string; fullName: string; department: string; days: { date: string; status: string }[] }
export const report = (month: string) => api.request<GridRow[]>(`/attendance/report?month=${month}`);
export const exportReport = (month: string, format: 'csv' | 'xlsx') => api.download(`/attendance/report/export?month=${month}&format=${format}`);
export type ConfigKind = 'shifts' | 'holidays';
export interface ConfigRow { id: string; name: string; date?: string; type?: string; startTime?: string; endTime?: string; graceMinutes?: number; breakMinutes?: number; weeklyOffDays?: number[]; effectiveFrom?: string | null; effectiveTo?: string | null }
export const configList = (kind: ConfigKind) => api.request<ConfigRow[]>(`/attendance/${kind}`);
export const createConfig = (kind: ConfigKind, body: Record<string, unknown>, id?: string) => api.request<ConfigRow>(`/attendance/${kind}${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body });
export const deleteConfig = (kind: ConfigKind, id: string) => api.request<void>(`/attendance/${kind}/${id}`, { method: 'DELETE' });
export const exportConfig = (kind: ConfigKind, format: 'csv' | 'xlsx') => api.download(`/attendance/${kind}/export?format=${format}`);
