/// <reference types="multer" />
// req.file comes from multer, applied by uploadSingle in @erp/attachments.
import { Router } from 'express';
import { uploadSingle } from '@erp/attachments';
import { rateLimit } from '../../middleware/rate-limit.js';
import { requireAuth } from '../../middleware/require-auth.js';
import * as account from './auth.account.js';
import {
  approveEmailChangeHandler,
  cancelEmailChangeHandler,
  changePasswordHandler,
  confirmEmailChangeHandler,
  getPendingEmailChangeHandler,
  listSessionsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
  requestEmailChangeHandler,
  revokeSessionHandler,
} from './auth.controller.js';

export const authRouter = Router();

const loginLimit = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  key: (req) => `${req.ip}|${String(req.body?.email ?? '').trim().toLowerCase()}`,
});
const refreshLimit = rateLimit({ windowMs: 60_000, max: 60, key: (req) => req.ip ?? '' });
const avatarFile = uploadSingle('file', { maxBytes: 2 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });

authRouter.post('/login', loginLimit, loginHandler);
authRouter.post('/refresh', refreshLimit, refreshHandler);
authRouter.post('/logout', logoutHandler);
authRouter.get('/me', requireAuth, meHandler);
authRouter.get('/sessions', requireAuth, listSessionsHandler);
authRouter.delete('/sessions/:sessionId', requireAuth, revokeSessionHandler);
authRouter.post('/change-password', requireAuth, changePasswordHandler);
authRouter.post('/email-change', requireAuth, requestEmailChangeHandler);
authRouter.get('/email-change', requireAuth, getPendingEmailChangeHandler);
authRouter.post('/email-change/approve', approveEmailChangeHandler);
authRouter.post('/email-change/cancel', cancelEmailChangeHandler);
authRouter.post('/email-change/confirm', confirmEmailChangeHandler);
authRouter.get('/account', requireAuth, async (req, res) => res.json(await account.getAccount(req.user!.sub)));
authRouter.patch('/display-name', requireAuth, async (req, res) => res.json(await account.setDisplayName(req.user!.sub, req.body)));
authRouter.post('/logout-everywhere', requireAuth, async (req, res) => {
  await account.logoutEverywhere(req.user!.sub);
  res.status(204).send();
});
authRouter.patch('/avatar', requireAuth, avatarFile, async (req, res) => res.json(await account.setOwnAvatar(req.user!.sub, req.file)));
authRouter.delete('/avatar', requireAuth, async (req, res) => res.json(await account.clearOwnAvatar(req.user!.sub)));
