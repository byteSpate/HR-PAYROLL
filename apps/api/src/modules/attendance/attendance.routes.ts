import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { decideAttendance, listAttendance, scopeForViewer, toApprovalItem } from './attendance.approval.js';
import { dateOnly } from '@erp/contracts/attendance';
import { writeAudit } from '@erp/audit';
import { getAttendanceReport, reportFilename, reportToCsv } from './attendance.report.js';
import { getAuditTrail, getEmployeeAttendance } from './attendance.history.js';
import { getDailySummary, getMonthlySummary } from './attendance.summary.js';
import { correctAttendance, manualAttendance, regulariseAttendance } from './attendance.edit.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);
const text = (value: unknown) => typeof value === 'string' ? value : undefined;
const reportQuerySchema = z.object({
  from: dateOnly,
  to: dateOnly,
  granularity: z.enum(['summary', 'daily']).optional(),
  employeeId: z.string().min(1).optional(),
  format: z.enum(['json', 'csv', 'pdf']).optional(),
});
attendanceRouter.get('/report', requirePermission('attendance.report'), async (req, res) => {
  const { format, ...query } = reportQuerySchema.parse(req.query);
  // HR-MNG-V1 renders the PDF in a headless browser; that dependency is not installed here yet.
  if (format === 'pdf') throw new AppError(501, 'PDF export is not available yet. Download the CSV instead.');
  const report = await getAttendanceReport(req.user!, query);
  if (format !== 'csv') {
    res.json(report);
    return;
  }
  await prisma.$transaction((tx) =>
    writeAudit(tx, {
      entity: 'ATTENDANCE_REPORT',
      entityId: `${report.from}..${report.to}`,
      action: 'EXPORT',
      changedBy: req.user!.sub,
      after: { granularity: report.granularity, headcount: report.headcount },
    }),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(report, 'csv')}"`);
  // A BOM, so Excel opens the file as UTF-8: without it every Bengali name arrives as mojibake.
  res.status(200).send(`\uFEFF${reportToCsv(report)}`);
});
// The derived views, read by the screens ported from HR-MNG-V1. Scope comes from the caller's attendance.read grant.
attendanceRouter.get('/summary/daily', requirePermission('attendance.read'), async (req, res) => {
  const date = text(req.query['date']);
  if (date) dateOnly.parse(date);
  res.json(await getDailySummary(req.user!, date));
});
attendanceRouter.get('/summary/monthly', requirePermission('attendance.read'), async (req, res) => {
  const { month, year } = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int().min(2000).max(2100) }).parse(req.query);
  res.json(await getMonthlySummary(req.user!, month, year));
});
// Sign-in is enough here: the service lets people read their own days and checks a grant for anyone else's.
attendanceRouter.get('/history/:employeeId', async (req, res) => {
  const from = text(req.query['from']);
  const to = text(req.query['to']);
  if (from) dateOnly.parse(from);
  if (to) dateOnly.parse(to);
  res.json(await getEmployeeAttendance(req.user!, String(req.params['employeeId']), from, to));
});
attendanceRouter.get('/:id/audit', requirePermission('attendance.manage'), async (req, res) => {
  res.json(await getAuditTrail(String(req.params['id'])));
});
attendanceRouter.get('/approvals', requirePermission('attendance.approve'), async (req, res) => {
  const rows = await listAttendance(req.user!, 'attendance.approve', { date: text(req.query['date']), status: text(req.query['status']) });
  res.json(rows.map(toApprovalItem));
});
attendanceRouter.post('/bulk-decide', requirePermission('attendance.approve'), async (req, res) => {
  const body = z.object({ ids: z.array(z.string()).min(1).max(100), decision: z.enum(['APPROVED', 'REJECTED']), note: z.string().optional() }).parse(req.body);
  if (body.decision === 'REJECTED' && !body.note?.trim()) throw new AppError(400, 'A rejection note is required');
  const results = [];
  for (const id of body.ids) {
    try { await decideAttendance(req.user!, id, body.decision, body.note); results.push({ id, status: 200 }); }
    catch (error) { if (!(error instanceof AppError)) throw error; results.push({ id, status: error.status, error: error.message }); }
  }
  res.json({ results });
});
attendanceRouter.post('/regularise', async (req, res) => res.json(await regulariseAttendance(req.user!.sub, req.body)));
attendanceRouter.get('/manual/employees', requirePermission('attendance.manage'), async (req, res) => { const scope = await scopeForViewer(req.user!, 'attendance.manage'); res.json(await prisma.employee.findMany({ where: scope, select: { id: true, fullName: true, employeeCode: true }, orderBy: { fullName: 'asc' } })); });
attendanceRouter.get('/manual/records', requirePermission('attendance.manage'), async (req, res) => res.json(await listAttendance(req.user!, 'attendance.manage', { date: text(req.query['date']) })));
attendanceRouter.post('/manual', requirePermission('attendance.manage'), async (req, res) => res.status(201).json(await manualAttendance(req.user!, req.body)));
attendanceRouter.get('/', requirePermission('attendance.read'), async (req, res) => res.json(await listAttendance(req.user!, 'attendance.read', { date: text(req.query['date']) })));
attendanceRouter.post('/:id/approve', requirePermission('attendance.approve'), async (req, res) => res.json(await decideAttendance(req.user!, String(req.params['id']), 'APPROVED', text(req.body?.note))));
attendanceRouter.post('/:id/reject', requirePermission('attendance.approve'), async (req, res) => res.json(await decideAttendance(req.user!, String(req.params['id']), 'REJECTED', text(req.body?.note))));
attendanceRouter.patch('/:id', requirePermission('attendance.manage'), async (req, res) => res.json(await correctAttendance(req.user!, String(req.params['id']), req.body)));
