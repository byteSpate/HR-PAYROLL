import { api } from '@/lib/api-client';
import type {
  ApprovalItem,
  AttendanceApproval,
  AttendanceDay,
  AttendanceReport,
  AuditEntry,
  BulkDecisionResult,
  DailySummary,
  HolidayItem,
  HolidayType,
  HolidayWriteResult,
  ImpactBlock,
  MonthlyAttendanceSummary,
  PunchResult,
  ReportGranularity,
  TodayAttendance,
} from './types';

// ── Calls in the shape the copied HR-MNG-V1 screens use ──
// The originals take an access token first. ERP's shared client attaches it, so it is accepted and
// ignored here, which lets the copied components run unchanged.

export const getApprovals = (_accessToken: string, status: AttendanceApproval = 'PENDING', minAgingDays?: number) =>
  api
    .request<ApprovalItem[]>(`/attendance/approvals?status=${status}`)
    .then((items) => (minAgingDays === undefined ? items : items.filter((i) => i.agingDays >= minAgingDays)));

export const bulkDecideAttendance = (_accessToken: string, ids: string[], decision: 'APPROVE' | 'REJECT', note?: string) =>
  api
    .request<{ results: { id: string; status: number; error?: string }[] }>('/attendance/bulk-decide', {
      method: 'POST',
      body: { ids, decision: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', note },
    })
    .then(({ results }): BulkDecisionResult[] =>
      results.map((r) => ({ id: r.id, ok: r.status === 200, ...(r.error ? { error: r.error } : {}) })),
    );

export const getMyMonthlySummary = (_accessToken: string, month: number, year: number) =>
  api.request<MonthlyAttendanceSummary[]>(`/attendance/summary/me?month=${month}&year=${year}`);

export const getToday = (_accessToken: string) => api.request<TodayAttendance>('/attendance/today');

export const getMyAttendance = (_accessToken: string, from?: string, to?: string) =>
  api.request<AttendanceDay[]>(`/attendance/me${range(from, to)}`);

export const checkIn = (_accessToken: string) => api.request<PunchResult>('/attendance/check-in', { method: 'POST' });

export const checkOut = (_accessToken: string) => api.request<PunchResult>('/attendance/check-out', { method: 'POST' });

export const regulariseAttendance = (_accessToken: string, id: string, body: { checkIn?: string; checkOut?: string; note: string }) =>
  api.request<{ id: string; approval: string }>(`/attendance/me/${id}/regularise`, { method: 'PATCH', body });

export const listHolidays = (_accessToken: string, year: number) => api.request<HolidayItem[]>(`/attendance/holidays?year=${year}`);

export const createHoliday = (_accessToken: string, body: { name: string; date: string; type: HolidayType }) =>
  api.request<HolidayWriteResult>('/attendance/holidays', { method: 'POST', body });

export const updateHoliday = (_accessToken: string, id: string, body: { name?: string; date?: string; type?: HolidayType }) =>
  api.request<HolidayWriteResult>(`/attendance/holidays/${id}`, { method: 'PATCH', body });

export const deleteHoliday = (_accessToken: string, id: string) =>
  api.request<{ impact?: ImpactBlock }>(`/attendance/holidays/${id}`, { method: 'DELETE' });

export const getDailySummary = (_accessToken: string, date?: string) =>
  api.request<DailySummary>(`/attendance/summary/daily${date ? `?date=${date}` : ''}`);

export const getMonthlySummary = (_accessToken: string, month: number, year: number) =>
  api.request<MonthlyAttendanceSummary[]>(`/attendance/summary/monthly?month=${month}&year=${year}`);

const range = (from?: string, to?: string) => {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
};

export const getEmployeeAttendance = (_accessToken: string, employeeId: string, from?: string, to?: string) =>
  api.request<AttendanceDay[]>(`/attendance/history/${employeeId}${range(from, to)}`);

export const getAuditTrail = (_accessToken: string, id: string) => api.request<AuditEntry[]>(`/attendance/${id}/audit`);

export const correctAttendance = (_accessToken: string, id: string, body: { checkIn?: string; checkOut?: string; note: string }) =>
  api.request<{ id: string; approval: string }>(`/attendance/${id}`, { method: 'PATCH', body });

export const createManualAttendance = (
  _accessToken: string,
  body: { employeeId: string; date: string; checkIn?: string; checkOut?: string; note: string },
) => api.request<{ id: string }>('/attendance/manual', { method: 'POST', body });

export interface AttendanceReportQuery {
  from: string;
  to: string;
  granularity?: ReportGranularity;
  employeeId?: string;
}

export type ReportFormat = 'pdf' | 'csv';

const reportQuery = (query: AttendanceReportQuery, format?: ReportFormat) => {
  const params = new URLSearchParams({ from: query.from, to: query.to });
  if (query.granularity) params.set('granularity', query.granularity);
  if (query.employeeId) params.set('employeeId', query.employeeId);
  if (format) params.set('format', format);
  return params.toString();
};

export const getAttendanceReport = (_accessToken: string, query: AttendanceReportQuery) =>
  api.request<AttendanceReport>(`/attendance/report?${reportQuery(query)}`);

export const downloadAttendanceReport = async (_accessToken: string, query: AttendanceReportQuery, format: ReportFormat = 'pdf') =>
  (await api.download(`/attendance/report?${reportQuery(query, format)}`)).blob;

// ── The module's own calls ──
export interface AttendanceRow { id: string; employeeId: string; date: string; checkIn: string | null; checkOut: string | null; workedHours: number | null; approval: string; exceptions?: string[]; employee?: { id: string; fullName: string; employeeCode: string } }
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

export const manualEmployees = () => api.request<{ id: string; fullName: string; employeeCode: string }[]>('/attendance/manual/employees');
export const manualRecords = (date: string) => api.request<AttendanceRow[]>(`/attendance/manual/records?date=${encodeURIComponent(date)}`);
export const correct = (id: string, body: { checkIn?: string; checkOut?: string; note: string }) => api.request<AttendanceRow>(`/attendance/${id}`, { method: 'PATCH', body });
