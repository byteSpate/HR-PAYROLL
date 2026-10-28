import { api } from '@/lib/api-client';
export interface AttendanceRow { id: string; employeeId: string; date: string; checkIn: string | null; checkOut: string | null; workedHours: number | null; approval: string; exceptions?: string[]; employee?: { id: string; fullName: string; employeeCode: string } }
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
export const manual = (body: { employeeId: string; date: string; checkIn: string; checkOut: string; note: string }) => api.request<AttendanceRow>('/attendance/manual', { method: 'POST', body });
export const importGuide = (kind: ConfigKind) => api.request<{ columns: import('@erp/ui/components/import-wizard').GuideRow[] }>(`/attendance/${kind}/import/guide`).then(result => result.columns);
export const importTemplate = (kind: ConfigKind, format: 'csv' | 'xlsx') => api.download(`/attendance/${kind}/import/template?format=${format}`);
const importFile = (kind: ConfigKind, action: 'preview' | 'commit', file: File) => { const data = new FormData(); data.append('file', file); return api.request<import('@erp/ui/components/import-wizard').ImportPreviewResult>(`/attendance/${kind}/import/${action}`, { method: 'POST', body: data }); };
export const importPreview = (kind: ConfigKind, file: File) => importFile(kind, 'preview', file);
export const importCommit = (kind: ConfigKind, file: File) => importFile(kind, 'commit', file);
export const regularise = (body: { date: string; checkIn?: string; checkOut?: string; note: string }) => api.request<void>('/attendance/regularise', { method: 'POST', body });

export const manualEmployees = () => api.request<{ id: string; fullName: string; employeeCode: string }[]>('/attendance/manual/employees');
export const manualRecords = (date: string) => api.request<AttendanceRow[]>(`/attendance/manual/records?date=${encodeURIComponent(date)}`);
export const correct = (id: string, body: { checkIn?: string; checkOut?: string; note: string }) => api.request<AttendanceRow>(`/attendance/${id}`, { method: 'PATCH', body });
