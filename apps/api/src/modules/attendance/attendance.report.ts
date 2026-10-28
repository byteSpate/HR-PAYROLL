import type { Request, Response } from 'express';
import { parseExportFormat, sendExport, type ExportSpec } from '@erp/export';
import { scopeForViewer } from './attendance.approval.js';
import { dailyGrid, type LeaveDaysFor } from './attendance.grid.js';

let leaveDaysFor: LeaveDaysFor | undefined;
export function setLeaveDaysFor(lookup: LeaveDaysFor) { leaveDaysFor = lookup; }

async function report(req: Request) {
  const scope = await scopeForViewer(req.user!, 'attendance.report');
  const departmentId = typeof req.query['departmentId'] === 'string' ? req.query['departmentId'] : undefined;
  return dailyGrid({ AND: [scope, ...(departmentId ? [{ departmentId }] : [])] }, String(req.query['month'] ?? ''), leaveDaysFor);
}
export async function getReport(req: Request, res: Response) { res.json(await report(req)); }
export async function exportReport(req: Request, res: Response) {
  const format = parseExportFormat(req.query['format']);
  const grid = await report(req);
  const dates = grid[0]?.days.map(d => d.date) ?? [];
  const spec: ExportSpec = {
    title: 'Attendance report',
    columns: [{ header: 'Employee code', type: 'text' }, { header: 'Name', type: 'text' }, { header: 'Department', type: 'text' }, ...dates.map(header => ({ header, type: 'text' as const }))],
    rows: grid.map(row => [row.employeeCode, row.fullName, row.department, ...row.days.map(day => day.status)]),
  };
  await sendExport({ res, spec, format, baseName: 'attendance', actor: req.user!, list: 'ATTENDANCE', filter: { month: req.query['month'], departmentId: req.query['departmentId'] } });
}
