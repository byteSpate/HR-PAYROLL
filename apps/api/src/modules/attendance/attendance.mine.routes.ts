import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { checkIn, checkOut, myAttendance } from './attendance.punch.js';

export const attendanceMineRouter = Router();
attendanceMineRouter.use(requireAuth);
attendanceMineRouter.post('/check-in', async (req, res) => {
  res.status(201).json(await checkIn(req.user!.sub));
});
attendanceMineRouter.post('/check-out', async (req, res) => {
  res.json(await checkOut(req.user!.sub));
});
attendanceMineRouter.get('/me', async (req, res) => {
  res.json(await myAttendance(req.user!.sub, String(req.query['month'] ?? '')));
});
