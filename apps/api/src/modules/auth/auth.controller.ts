import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { changePasswordSchema, loginSchema } from '@erp/contracts/core';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { REFRESH_COOKIE_NAME, refreshCookieOptions, refreshCookieSetOptions, sessionContext } from './auth.cookies.js';
import * as service from './auth.service.js';
import { listSessions, revokeSession } from './auth.sessions.js';

// Express 5 forwards rejected promises, but this keeps handlers' intent explicit and typed.
type Handler = (req: Request, res: Response) => Promise<unknown>;
const wrap =
  (fn: Handler): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

const rawCookie = (req: Request): string | undefined => req.cookies?.[REFRESH_COOKIE_NAME];

export const loginHandler = wrap(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { accessToken, refreshToken, user } = await service.login(email, password, sessionContext(req));
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieSetOptions());
  res.status(200).json({ accessToken, user });
});

export const refreshHandler = wrap(async (req, res) => {
  const token = rawCookie(req);
  if (!token) throw new AppError(401, 'No refresh token provided');
  const { accessToken, refreshToken, user } = await service.refresh(token, sessionContext(req));
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieSetOptions());
  res.status(200).json({ accessToken, user });
});

export const logoutHandler = wrap(async (req, res) => {
  const token = rawCookie(req);
  if (token) await service.logout(token);
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(200).json({ success: true });
});

export const meHandler = wrap(async (req, res) => {
  res.status(200).json(await service.loadPublicUser(prisma, req.user!.sub));
});

export const listSessionsHandler = wrap(async (req, res) => {
  res.status(200).json(await listSessions(req.user!.sub, rawCookie(req)));
});

export const revokeSessionHandler = wrap(async (req, res) => {
  await revokeSession(req.user!.sub, String(req.params['sessionId']), rawCookie(req));
  res.status(204).send();
});

export const changePasswordHandler = wrap(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  const user = await service.changePassword(req.user!.sub, currentPassword, newPassword, rawCookie(req));
  res.status(200).json({ success: true, user });
});
