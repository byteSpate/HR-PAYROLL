import { Router } from 'express';
import { rateLimit } from '../../middleware/rate-limit.js';
import { requireAuth } from '../../middleware/require-auth.js';
import {
  changePasswordHandler,
  listSessionsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  revokeSessionHandler,
} from './auth.controller.js';

export const authRouter = Router();

const loginLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
});
const refreshLimit = rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.ip ?? '' });

authRouter.post('/login', loginLimit, loginHandler);
authRouter.post('/refresh', refreshLimit, refreshHandler);
authRouter.post('/logout', logoutHandler);
authRouter.get('/me', requireAuth, meHandler);
authRouter.get('/sessions', requireAuth, listSessionsHandler);
authRouter.delete('/sessions/:sessionId', requireAuth, revokeSessionHandler);
authRouter.post('/change-password', requireAuth, changePasswordHandler);
