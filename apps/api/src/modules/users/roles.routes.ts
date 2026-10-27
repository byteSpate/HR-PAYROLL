import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import * as service from './roles.service.js';

export const rolesRouter = Router();

rolesRouter.use(requireAuth, requirePermission('role.manage'));

rolesRouter.get('/', async (_req, res) => {
  res.json(await service.listRoles());
});

// Registered before '/:id' routes so 'permissions' is never read as an id.
rolesRouter.get('/permissions', async (_req, res) => {
  res.json(await service.listPermissionGroups());
});

rolesRouter.post('/', async (req, res) => {
  res.status(201).json(await service.createRole(req.body, req.user!.sub));
});

rolesRouter.patch('/:id', async (req, res) => {
  res.json(await service.updateRole(req.params['id']!, req.body, req.user!.sub));
});

rolesRouter.delete('/:id', async (req, res) => {
  await service.deleteRole(req.params['id']!, req.user!.sub);
  res.status(204).end();
});
