import { Router, type Request } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { setAccessLevel } from './access-level.js';
import type { Caller } from './guards.js';
import * as service from './users.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, requirePermission('user.manage'));

// requireAuth has run, so req.user is set.
const caller = (req: Request): Caller => req.user!;

// Registered before any '/:id' route. Lets user admins pick roles without holding role.manage.
usersRouter.get('/role-options', async (_req, res) => {
  res.json(await service.listRoleOptions());
});

usersRouter.get('/', async (req, res) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;
  res.json(await service.listUsers(q));
});

usersRouter.post('/', async (req, res) => {
  res.status(201).json(await service.createUser(req.body, caller(req)));
});

usersRouter.patch('/:id/role', async (req, res) => {
  res.json(await service.setUserRole(req.params['id']!, req.body, caller(req)));
});

usersRouter.patch('/:id/access-level', async (req, res) => {
  res.json(await setAccessLevel(req.params['id']!, req.body, caller(req)));
});

usersRouter.patch('/:id/status', async (req, res) => {
  res.json(await service.setUserStatus(req.params['id']!, req.body, caller(req)));
});
