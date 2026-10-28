import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { decideAttendance, listAttendance, scopeForViewer, toApprovalItem } from './attendance.approval.js';
import { exportReport, getReport } from './attendance.report.js';
import { correctAttendance, manualAttendance, regulariseAttendance } from './attendance.edit.js';

export const attendanceRouter = Router();
attendanceRouter.use(requireAuth);
const text = (value: unknown) => typeof value === 'string' ? value : undefined;
attendanceRouter.get('/report/export', requirePermission('attendance.report'), exportReport);
attendanceRouter.get('/report', requirePermission('attendance.report'), getReport);
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
