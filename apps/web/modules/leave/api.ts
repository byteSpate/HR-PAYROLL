import { api } from '@/lib/api-client';
import type { ApplyLeaveInput, CreateLeaveTypeInput, UpdateLeaveTypeInput, HalfDayWindow, LeaveBalanceItem, LeaveRequestItem, LeaveType as FullLeaveType, TeamMemberStatus } from './types';

// ── Calls in the shape the copied HR-MNG-V1 screens use ──
// The originals take an access token first. ERP's shared client attaches it, so it is accepted and
// ignored here, which lets the copied components run unchanged. HR-MNG-V1 decides with PATCH; this
// API uses POST.

export const listLeaveTypes = (_accessToken: string) => api.request<FullLeaveType[]>('/leave/types');

export const listLeaveRequests = (_accessToken: string) => api.request<LeaveRequestItem[]>('/leave/requests');

export const getTeamStatus = (_accessToken: string) => api.request<TeamMemberStatus[]>('/leave/team-status');

export const getHalfDayWindow = (_accessToken: string, date: string) =>
  api.request<HalfDayWindow | null>(`/leave/half-day-window?date=${date}`);

export const getMyLeaveBalances = (_accessToken: string) => api.request<LeaveBalanceItem[]>('/leave/balances/me');

export const applyForLeave = (_accessToken: string, input: ApplyLeaveInput) =>
  api.request<LeaveRequestItem>('/leave/requests', { method: 'POST', body: input });

export const approveLeaveRequest = (_accessToken: string, id: string) =>
  api.request<LeaveRequestItem>(`/leave/requests/${id}/approve`, { method: 'POST', body: {} });

export const rejectLeaveRequest = (_accessToken: string, id: string, note: string) =>
  api.request<LeaveRequestItem>(`/leave/requests/${id}/reject`, { method: 'POST', body: { note } });

export const revertLeaveRequest = (_accessToken: string, id: string, note: string) =>
  api.request<LeaveRequestItem>(`/leave/requests/${id}/revert`, { method: 'POST', body: { note } });

export const cancelLeaveRequest = (_accessToken: string, id: string) =>
  api.request<LeaveRequestItem>(`/leave/requests/${id}/cancel`, { method: 'POST', body: {} });

export const createLeaveType = (_accessToken: string, input: CreateLeaveTypeInput) =>
  api.request<FullLeaveType>('/leave/types', { method: 'POST', body: input });

/** `code` is immutable, so it never goes in an update body. */
export const updateLeaveType = (_accessToken: string, id: string, input: UpdateLeaveTypeInput) =>
  api.request<FullLeaveType>(`/leave/types/${id}`, { method: 'PATCH', body: input });

export const deleteLeaveType = (_accessToken: string, id: string) => api.request<void>(`/leave/types/${id}`, { method: 'DELETE' });
