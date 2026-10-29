import { Router } from 'express';
import { officeToday } from '@erp/export';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import { adjustBalance, deleteLeaveType, createLeaveType, updateLeaveType } from './leave.admin.js';
import { applyForLeave, balancesFor, cancelLeave, decideLeave, previewLeave } from './leave.service.js';
import { getHalfDayWindow, getTeamStatus, listRequests, myBalances, requestItem } from './leave.wire.js';

export const leaveRouter = Router();
leaveRouter.use(requireAuth);
const year = (value: unknown) => (typeof value === 'string' && value ? Number(value) : officeToday().getUTCFullYear());
const note = (body: unknown) => (typeof (body as { note?: unknown } | undefined)?.note === 'string' ? (body as { note: string }).note : undefined);
leaveRouter.post('/types', requirePermission('leave.config'), async (req, res) => res.status(201).json(await createLeaveType(req.user!.sub, req.body)));
leaveRouter.patch('/types/:id', requirePermission('leave.config'), async (req, res) => res.json(await updateLeaveType(req.user!.sub, String(req.params['id']), req.body)));
leaveRouter.delete('/types/:id', requirePermission('leave.config'), async (req, res) => { await deleteLeaveType(req.user!.sub, String(req.params['id'])); res.status(204).end(); });
leaveRouter.get('/config/employees', requirePermission('leave.config'), async (_req, res) => res.json(await prisma.employee.findMany({ select: { id: true, fullName: true, employeeCode: true }, orderBy: { fullName: 'asc' } })));
leaveRouter.post('/balances/adjust', requirePermission('leave.config'), async (req, res) => res.json(await adjustBalance(req.user!.sub, req.body)));
leaveRouter.get('/types', async (_req, res) => res.json(await prisma.leaveType.findMany({ orderBy: { name: 'asc' } })));
leaveRouter.get('/balances/me', async (req, res) => res.json(await myBalances(req.user!.sub, year(req.query['year']))));
leaveRouter.get('/balances/:employeeId', requirePermission('leave.read'), async (req, res) => {
  const scope = await scopeForViewer(req.user!, 'leave.read');
  const employeeId = String(req.params['employeeId']);
  if (!await prisma.employee.count({ where: { AND: [scope, { id: employeeId }] } })) throw new AppError(403, 'Forbidden');
  res.json(await balancesFor(employeeId, year(req.query['year'])));
});
leaveRouter.get('/team-status', requirePermission('leave.read'), async (req, res) => res.json(await getTeamStatus(req.user!)));
leaveRouter.get('/half-day-window', async (req, res) => res.json(await getHalfDayWindow(req.user!.sub, req.query['date'])));
leaveRouter.post('/preview', async (req, res) => res.json(await previewLeave(req.user!.sub, req.body)));
leaveRouter.post('/requests', async (req, res) => res.status(201).json(await requestItem((await applyForLeave(req.user!.sub, req.body)).id)));
leaveRouter.get('/requests', async (req, res) => res.json(await listRequests(req.user!)));
leaveRouter.post('/requests/:id/approve', requirePermission('leave.approve'), async (req, res) => {
  const id = String(req.params['id']);
  await decideLeave(req.user!, id, 'APPROVED', note(req.body));
  res.json(await requestItem(id));
});
leaveRouter.post('/requests/:id/reject', requirePermission('leave.approve'), async (req, res) => {
  const id = String(req.params['id']);
  await decideLeave(req.user!, id, 'REJECTED', note(req.body));
  res.json(await requestItem(id));
});
leaveRouter.post('/requests/:id/cancel', async (req, res) => {
  const id = String(req.params['id']);
  await cancelLeave(req.user!, id);
  res.json(await requestItem(id));
});
leaveRouter.post('/requests/:id/revert', requirePermission('leave.manage'), async (req, res) => {
  const id = String(req.params['id']);
  await cancelLeave(req.user!, id, true);
  res.json(await requestItem(id));
});
