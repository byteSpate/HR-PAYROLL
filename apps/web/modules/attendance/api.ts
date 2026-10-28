import { api } from '@/lib/api-client';
export interface AttendanceRow { id: string; employeeId: string; date: string; checkIn: string | null; checkOut: string | null; workedHours: number | null; approval: string; employee?: { id: string; fullName: string; employeeCode: string } }
export const myAttendance = (month: string) => api.request<AttendanceRow[]>(`/attendance/me?month=${encodeURIComponent(month)}`);
export const punch = (action: 'check-in' | 'check-out') => api.request<void>(`/attendance/${action}`, { method: 'POST' });
export const listAttendance = (query = '') => api.request<AttendanceRow[]>(`/attendance${query}`);
export const bulkDecide = (ids: string[], decision: 'APPROVED' | 'REJECTED', note: string) => api.request<{ results: { id: string; status: number; error?: string }[] }>('/attendance/bulk-decide', { method: 'POST', body: { ids, decision, note } });
