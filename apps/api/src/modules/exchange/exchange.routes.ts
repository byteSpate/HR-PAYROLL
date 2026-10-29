import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import * as service from './exchange.service.js';

export const exchangeRouter = Router();

exchangeRouter.use(requireAuth);

// Readable by anyone signed in: a payslip or claim quotes the rate, and a figure that cannot be checked is not trusted.
exchangeRouter.get('/', async (_req, res) => {
  res.json(await service.listExchangeRates());
});
exchangeRouter.post('/', requirePermission('exchange.config'), async (req, res) => {
  res.status(201).json(await service.createExchangeRate(req.user!.sub, req.body));
});
exchangeRouter.patch('/:id', requirePermission('exchange.config'), async (req, res) => {
  res.json(await service.updateExchangeRate(String(req.params['id']), req.user!.sub, req.body));
});
