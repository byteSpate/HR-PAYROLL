import { Router } from 'express';
import { officeToday } from '@erp/export';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { scopeForViewer } from '../attendance/attendance.approval.js';
import { adjustBalance, deleteLeaveType, saveLeaveType } from './leave.admin.js';
import { applyForLeave, cancelLeave, decideLeave, previewLeave } from './leave.service.js';

export const leaveRouter = Router();
leaveRouter.use(requireAuth);
async function me(userId: string) {
  const employee = await prisma.employee.findUnique({ where: { userId }, select: { id: true } });
  if (!employee) throw new AppError(403, 'An employee record is required');
  return employee;
}
leaveRouter.post('/types', requirePermission('leave.config'), async (req, res) => res.status(201).json(await saveLeaveType(req.user!.sub, req.body)));
leaveRouter.patch('/types/:id', requirePermission('leave.config'), async (req, res) => res.json(await saveLeaveType(req.user!.sub, req.body, String(req.params['id']))));
leaveRouter.delete('/types/:id', requirePermission('leave.config'), async (req, res) => { await deleteLeaveType(req.user!.sub, String(req.params['id'])); res.status(204).end(); });
leaveRouter.post('/balances/adjust', requirePermission('leave.config'), async (req, res) => res.json(await adjustBalance(req.user!.sub, req.body)));
leaveRouter.get('/types', async (_req, res) => res.json(await prisma.leaveType.findMany({ orderBy: { name: 'asc' } })));
leaveRouter.get('/balances/me', async (req, res) => res.json(await prisma.leaveBalance.findMany({ where: { employeeId: (await me(req.user!.sub)).id }, include: { leaveType: true } })));
leaveRouter.get('/balances/:employeeId', requirePermission('leave.read'), async (req, res) => {
  const scope = await scopeForViewer(req.user!, 'leave.read');
  const employeeId = String(req.params['employeeId']);
  if (!await prisma.employee.count({ where: { AND: [scope, { id: employeeId }] } })) throw new AppError(403, 'Forbidden');
  res.json(await prisma.leaveBalance.findMany({ where: { employeeId }, include: { leaveType: true } }));
});
leaveRouter.get('/team-status', requirePermission('leave.read'), async (req, res) => {
  const scope = await scopeForViewer(req.user!, 'leave.read');
  const today = officeToday();
  res.json(await prisma.leaveRequest.findMany({ where: { employee: scope, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, include: { employee: { select: { id: true, fullName: true, employeeCode: true } }, leaveType: true } }));
});
leaveRouter.post('/preview', async (req, res) => res.json(await previewLeave(req.user!.sub, req.body)));
leaveRouter.post('/requests', async (req, res) => res.status(201).json(await applyForLeave(req.user!.sub, req.body)));
leaveRouter.get('/requests', async (req, res) => {
  const mine = req.query['scope'] === 'mine';
  const scope = mine ? { id: (await me(req.user!.sub)).id } : await scopeForViewer(req.user!, req.query['scope'] === 'approvals' ? 'leave.approve' : 'leave.read');
  res.json(await prisma.leaveRequest.findMany({ where: { employee: scope }, include: { leaveType: true, employee: { select: { id: true, fullName: true, employeeCode: true } } }, orderBy: { createdAt: 'desc' } }));
});
leaveRouter.post('/requests/:id/approve', requirePermission('leave.approve'), async (req, res) => res.json(await decideLeave(req.user!, String(req.params['id']), 'APPROVED', typeof req.body?.note === 'string' ? req.body.note : undefined)));
leaveRouter.post('/requests/:id/reject', requirePermission('leave.approve'), async (req, res) => res.json(await decideLeave(req.user!, String(req.params['id']), 'REJECTED', typeof req.body?.note === 'string' ? req.body.note : undefined)));
leaveRouter.post('/requests/:id/cancel', async (req, res) => res.json(await cancelLeave(req.user!, String(req.params['id']))));
leaveRouter.post('/requests/:id/revert', requirePermission('leave.manage'), async (req, res) => res.json(await cancelLeave(req.user!, String(req.params['id']), true)));
