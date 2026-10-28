import { api } from '@/lib/api-client';
import type { LeaveApplication } from './components/leave-apply-form';
export interface LeaveType { id: string; name: string; isPaid: boolean }
export interface LeaveRequest { id: string; startDate: string; endDate: string; chargedDays: number; status: string; leaveType: LeaveType; employee: { id: string; fullName: string; employeeCode: string } }
export interface LeaveBalance { id: string; year: number; accrued: number; used: number; balance: number; leaveType: LeaveType }
export const types = () => api.request<LeaveType[]>('/leave/types');
export const preview = (body: LeaveApplication) => api.request<{ chargedDays: number; available: number | null }>('/leave/preview', { method: 'POST', body });
export const apply = (body: LeaveApplication) => api.request<void>('/leave/requests', { method: 'POST', body });
export const requests = (scope: 'mine' | 'team' | 'approvals') => api.request<LeaveRequest[]>(`/leave/requests?scope=${scope}`);
export const balances = () => api.request<LeaveBalance[]>('/leave/balances/me');
export const decide = (id: string, action: 'approve' | 'reject' | 'cancel', note = '') => api.request<void>(`/leave/requests/${id}/${action}`, { method: 'POST', body: { note } });
export const teamStatus = () => api.request<LeaveRequest[]>('/leave/team-status');
