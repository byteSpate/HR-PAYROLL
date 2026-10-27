import { Router } from 'express';
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

authRouter.post('/login', loginHandler);
authRouter.post('/refresh', refreshHandler);
authRouter.post('/logout', logoutHandler);
authRouter.get('/me', requireAuth, meHandler);
authRouter.get('/sessions', requireAuth, listSessionsHandler);
authRouter.delete('/sessions/:sessionId', requireAuth, revokeSessionHandler);
authRouter.post('/change-password', requireAuth, changePasswordHandler);
