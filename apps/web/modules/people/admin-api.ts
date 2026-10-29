import { api } from '@/lib/api-client';
import type { EmployeeView } from '@erp/contracts/employee';
import type { LeaveBalanceItem } from '../leave/types';
import { updateEmployee } from '../employee/profile-api';

export { updateEmployee };
export { resendEmployeeInvite } from '../settings/api';
export { setExitDetails } from '../settlement/api';
export { listDepartments } from '../department/panel-api';
export { listShifts } from '../attendance/panel-api';
export { listSalaryStructures } from '../payroll/api';

// The admin screens copied from HR-MNG-V1 keep its call signatures, including the access token the shared client
// already attaches, so the first argument is ignored.

/** Everyone the viewer's grant reaches; the directory in `profile-api` is the colleague list, this is the admin one. */
export const listEmployees = (_accessToken: string) => api.request<EmployeeView[]>('/employees');
export const getEmployee = (_accessToken: string, id: string) => api.request<EmployeeView>(`/employees/${id}`);

export interface CreateStaffAccountInput {
  fullName: string;
  email: string;
  designation: string;
  departmentId: string;
  employmentType: string;
  joiningDate: string;
  reportingManagerId?: string;
  shiftId?: string;
}

export interface CreateStaffAccountResult {
  employeeCode: string;
  temporaryPassword: string;
  fullName: string;
  email: string;
}

export const createStaffAccount = (_accessToken: string, input: CreateStaffAccountInput) =>
  api.request<CreateStaffAccountResult>('/employees', { method: 'POST', body: input });

export const setSalaryStructure = (_accessToken: string, employeeId: string, salaryStructureId: string | null) =>
  api.request<EmployeeView>(`/employees/${employeeId}/salary-structure`, { method: 'PUT', body: { salaryStructureId } });

export const setAccountActive = (_accessToken: string, employeeId: string, isActive: boolean) =>
  api.request<{ id: string; accountActive: boolean }>(`/employees/${employeeId}/account`, { method: 'PATCH', body: { isActive } });

export const changeEmployeeEmail = (_accessToken: string, employeeId: string, newEmail: string) =>
  api.request<{ email: string; previousEmail: string; inviteResent: boolean }>(`/employees/${employeeId}/email`, {
    method: 'PATCH',
    body: { newEmail },
  });

export const approveNationalIdChangeRequest = (_accessToken: string, requestId: string) =>
  api.request<{ id: string }>(`/employees/national-id-requests/${requestId}/decide`, { method: 'PATCH', body: { approve: true } });
export const rejectNationalIdChangeRequest = (_accessToken: string, requestId: string, note: string) =>
  api.request<{ id: string }>(`/employees/national-id-requests/${requestId}/decide`, { method: 'PATCH', body: { approve: false, note } });

interface BalanceRow {
  leaveTypeId: string;
  accrued: number;
  used: number;
  balance: number;
  leaveType: { code: string; name: string; isPaid: boolean; annualQuota: number };
}

/** The balance rows as the original's card reads them: the leave type flattened in, accrued as the entitlement. */
export const getLeaveBalancesFor = async (_accessToken: string, employeeId: string): Promise<LeaveBalanceItem[]> =>
  (await api.request<BalanceRow[]>(`/leave/balances/${employeeId}`)).map((row) => ({
    leaveTypeId: row.leaveTypeId,
    code: row.leaveType.code,
    name: row.leaveType.name,
    isPaid: row.leaveType.isPaid,
    annualQuota: row.leaveType.annualQuota,
    entitlement: row.accrued,
    used: row.used,
    pending: 0,
    balance: row.balance,
    accrual: null,
  }));
