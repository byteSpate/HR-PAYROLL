/// <reference types="multer" />
// req.file comes from multer, applied by uploadSingle in @erp/attachments.
import { Router, type Request, type RequestHandler } from 'express';
import { requireStorage, uploadSingle } from '@erp/attachments';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import type { Viewer } from './employee.access.js';
import * as changes from './employee.changerequest.js';
import { recordExit, setAccountActive } from './employee.exit.js';
import * as media from './employee.media.js';
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

// Storage is checked before multer buffers the upload, so an unconfigured server answers 503 at once.
const storageReady: RequestHandler = (_req, _res, next) => {
  requireStorage();
  next();
};
const documentFile = uploadSingle('file', { maxBytes: 10 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] });
const avatarFile = uploadSingle('file', { maxBytes: 2 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
const id = (req: Request) => String(req.params['id']);

employeeRouter.get('/:id/documents', async (req, res) => {
  res.json(await media.listDocuments(viewer(req), id(req)));
});
employeeRouter.post('/:id/documents', storageReady, documentFile, async (req, res) => {
  res.status(201).json(await media.uploadDocument(viewer(req), id(req), req.body, req.file));
});
employeeRouter.get('/:id/documents/:docId/url', async (req, res) => {
  res.json(await media.documentUrl(viewer(req), id(req), String(req.params['docId'])));
});
employeeRouter.delete('/:id/documents/:docId', async (req, res) => {
  await media.deleteDocument(viewer(req), id(req), String(req.params['docId']));
  res.status(204).send();
});

employeeRouter.patch('/:id/avatar', storageReady, avatarFile, async (req, res) => {
  res.json(await media.setAvatar(viewer(req), id(req), req.file));
});
employeeRouter.delete('/:id/avatar', async (req, res) => {
  res.json(await media.clearAvatar(viewer(req), id(req)));
});
