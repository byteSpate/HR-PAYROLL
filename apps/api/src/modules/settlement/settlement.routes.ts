import { Router } from 'express';
import { overrideSettlementBody, settlementRejectBody } from '@erp/contracts/settlement';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import type { Viewer } from '../employee/employee.access.js';
import { scopeForViewer } from '../employee/employee.scope.js';
import {
  approveSettlement,
  calculateSettlement,
  getSettlement,
  listSettlements,
  overrideSettlement,
  paySettlement,
  rejectSettlement,
} from './settlement.service.js';

export const settlementRouter = Router();
settlementRouter.use(requireAuth);

const id = (req: { params: Record<string, unknown> }) => String(req.params['id']);
const actorOf = (req: { user?: Viewer }) => ({
  userId: req.user!.sub,
  isAdmin: req.user!.accessLevel !== 'STANDARD',
});

/** An employee outside the viewer's reach does not exist for them, so probing ids confirms nothing. */
async function assertReaches(viewer: Viewer, permission: string, employeeId: string) {
  const found = await prisma.employee.count({
    where: { AND: [{ id: employeeId }, await scopeForViewer(viewer, permission)] },
  });
  if (found === 0) throw new AppError(404, 'Employee not found');
}

// The employee has no route here: their statement reaches them by mail when it is paid.
settlementRouter.get('/', requirePermission('settlement.read'), async (req, res) => {
  res.json(await listSettlements(await scopeForViewer(req.user!, 'settlement.read')));
});
settlementRouter.post(
  '/:employeeId/calculate',
  requirePermission('settlement.create'),
  async (req, res) => {
    const employeeId = String(req.params['employeeId']);
    await assertReaches(req.user!, 'settlement.create', employeeId);
    res.status(201).json(await calculateSettlement(employeeId, req.user!.sub));
  },
);
settlementRouter.get('/:employeeId', requirePermission('settlement.read'), async (req, res) => {
  const employeeId = String(req.params['employeeId']);
  await assertReaches(req.user!, 'settlement.read', employeeId);
  res.json(await getSettlement(employeeId));
});
settlementRouter.patch('/id/:id', requirePermission('settlement.create'), async (req, res) => {
  const row = await prisma.settlement.findUnique({
    where: { id: id(req) },
    select: { employeeId: true },
  });
  if (!row) throw new AppError(404, 'Settlement not found');
  await assertReaches(req.user!, 'settlement.create', row.employeeId);
  res.json(
    await overrideSettlement(id(req), req.user!.sub, overrideSettlementBody.parse(req.body)),
  );
});
settlementRouter.post(
  '/id/:id/approve',
  requirePermission('settlement.approve:all'),
  async (req, res) => {
    res.json(await approveSettlement(id(req), actorOf(req)));
  },
);
settlementRouter.post(
  '/id/:id/reject',
  requirePermission('settlement.approve:all'),
  async (req, res) => {
    res.json(await rejectSettlement(id(req), actorOf(req), settlementRejectBody.parse(req.body)));
  },
);
settlementRouter.post('/id/:id/pay', requirePermission('settlement.pay:all'), async (req, res) => {
  res.json(await paySettlement(id(req), req.user!.sub));
});
