import { Router } from 'express';
import { z } from 'zod';
import { dateOnly } from '@erp/contracts/attendance';
import { requireAuth } from '../../middleware/require-auth.js';
import { regulariseAttendance } from './attendance.edit.js';
import { getMyAttendance, getMyMonthlySummary, getToday } from './attendance.me.js';
import { checkIn, checkOut } from './attendance.punch.js';

export const attendanceMineRouter = Router();
attendanceMineRouter.use(requireAuth);
const range = (value: unknown) => (typeof value === 'string' ? dateOnly.parse(value) : undefined);
attendanceMineRouter.post('/check-in', async (req, res) => {
  res.status(201).json(await checkIn(req.user!.sub));
});
attendanceMineRouter.post('/check-out', async (req, res) => {
  res.json(await checkOut(req.user!.sub));
});
attendanceMineRouter.get('/today', async (req, res) => {
  res.json(await getToday(req.user!.sub));
});
attendanceMineRouter.get('/summary/me', async (req, res) => {
  const { month, year } = z.object({ month: z.coerce.number().int().min(1).max(12), year: z.coerce.number().int().min(2000).max(2100) }).parse(req.query);
  res.json(await getMyMonthlySummary(req.user!.sub, month, year));
});
attendanceMineRouter.get('/me', async (req, res) => {
  res.json(await getMyAttendance(req.user!.sub, range(req.query['from']), range(req.query['to'])));
});
attendanceMineRouter.patch('/me/:id/regularise', async (req, res) => {
  res.json(await regulariseAttendance(req.user!.sub, String(req.params['id']), req.body));
});
