import { Router, type Request } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import type { Viewer } from './employee.access.js';
import * as changes from './employee.changerequest.js';
import { recordExit, setAccountActive } from './employee.exit.js';
import { exportEmployees } from './employee.export.js';
import * as service from './employee.service.js';
import { listTeam } from './employee.team.js';

export const employeeRouter = Router();

employeeRouter.use(requireAuth);

const viewer = (req: Request): Viewer => req.user!;
const filter = (req: Request): service.ListFilter => ({
  q: typeof req.query['q'] === 'string' ? req.query['q'] : undefined,
  departmentId: typeof req.query['departmentId'] === 'string' ? req.query['departmentId'] : undefined,
  status: typeof req.query['status'] === 'string' ? req.query['status'] : undefined,
});

employeeRouter.post('/', requirePermission('employee.create'), async (req, res) => {
  res.status(201).json(await service.createEmployee(req.body, viewer(req)));
});

employeeRouter.get(
  '/',
  requirePermission(['employee.read:department', 'employee.read.financial']),
  async (req, res) => {
    res.json(await service.listEmployees(viewer(req), filter(req)));
  },
);

// Literal paths before '/:id' so they are never read as an id.
employeeRouter.get('/export', requirePermission('employee.export'), exportEmployees);

employeeRouter.get('/team', requirePermission('employee.read:team'), async (req, res) => {
  res.json(await listTeam(viewer(req)));
});

employeeRouter.post('/national-id-requests', async (req, res) => {
  res.status(201).json(await changes.requestNationalIdChange(viewer(req), req.body));
});
employeeRouter.get('/national-id-requests', requirePermission('employee.id_request.decide:department'), async (req, res) => {
  const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
  res.json(await changes.listNationalIdChanges(viewer(req), status));
});
employeeRouter.patch('/national-id-requests/:id/cancel', async (req, res) => {
  res.json(await changes.cancelNationalIdChange(viewer(req), String(req.params['id'])));
});
employeeRouter.patch(
  '/national-id-requests/:id/decide',
  requirePermission('employee.id_request.decide:department'),
  async (req, res) => {
    res.json(await changes.decideNationalIdChange(viewer(req), String(req.params['id']), req.body));
  },
);

employeeRouter.get('/me', async (req, res) => {
  res.json(await service.getMyEmployee(viewer(req)));
});

employeeRouter.get('/directory', async (req, res) => {
  res.json(await service.directory(viewer(req), filter(req)));
});

employeeRouter.get('/:id', async (req, res) => {
  res.json(await service.getEmployee(viewer(req), String(req.params['id'])));
});

employeeRouter.patch('/:id', async (req, res) => {
  res.json(await service.updateEmployee(viewer(req), String(req.params['id']), req.body));
});

employeeRouter.patch('/:id/exit', requirePermission('employee.exit:department'), async (req, res) => {
  res.json(await recordExit(viewer(req), String(req.params['id']), req.body));
});

employeeRouter.patch('/:id/account', requirePermission('employee.update:department'), async (req, res) => {
  res.json(await setAccountActive(viewer(req), String(req.params['id']), req.body));
});
