import { Router } from 'express';
import { notificationQuerySchema } from '@erp/contracts/notification';
import { listNotifications, markAllRead, markRead, unreadCount } from '@erp/notifications';
import { requireAuth } from '../../middleware/require-auth.js';

export const notificationRouter = Router();

// Sign-in is the only requirement: every handler scopes to the caller, so there is nothing to grant.
notificationRouter.use(requireAuth);

notificationRouter.get('/', async (req, res) => {
  const { cursor, limit, unreadOnly } = notificationQuerySchema.parse(req.query);
  res.json(await listNotifications(req.user!.sub, { cursor, limit, unreadOnly }));
});

// Literal paths before '/:id/read' so they are never read as an id.
notificationRouter.get('/unread-count', async (req, res) => {
  res.json({ count: await unreadCount(req.user!.sub) });
});

notificationRouter.post('/read-all', async (req, res) => {
  res.json({ changed: await markAllRead(req.user!.sub) });
});

notificationRouter.post('/:id/read', async (req, res) => {
  await markRead(req.user!.sub, String(req.params['id']));
  res.status(204).end();
});
