import { Router } from 'express';
import { claimQuery } from '@erp/contracts/expense';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import * as categories from './expense.category.service.js';
import * as service from './expense.service.js';

export const expenseRouter = Router();

expenseRouter.use(requireAuth);

const id = (req: { params: Record<string, unknown> }) => String(req.params['id']);

expenseRouter.get('/categories', async (_req, res) => {
  res.json(await categories.listCategories());
});
expenseRouter.post('/categories', requirePermission('expense.config'), async (req, res) => {
  res.status(201).json(await categories.createCategory(req.user!.sub, req.body));
});
expenseRouter.patch('/categories/:id', requirePermission('expense.config'), async (req, res) => {
  res.json(await categories.renameCategory(req.user!.sub, id(req), req.body));
});
expenseRouter.delete('/categories/:id', requirePermission('expense.config'), async (req, res) => {
  await categories.deleteCategory(req.user!.sub, id(req));
  res.status(204).send();
});

// Literal paths before '/:id' so they are never read as an id.
expenseRouter.get('/me', async (req, res) => {
  res.json(await service.getMyClaims(req.user!));
});
expenseRouter.get('/', requirePermission('expense.read'), async (req, res) => {
  res.json(await service.listClaims(req.user!, claimQuery.parse(req.query)));
});
expenseRouter.post('/', async (req, res) => {
  res.status(201).json(await service.createClaim(req.user!, req.body));
});

expenseRouter.get('/:id', async (req, res) => {
  res.json(await service.getClaim(req.user!, id(req)));
});
expenseRouter.patch('/:id', async (req, res) => {
  res.json(await service.updateClaim(req.user!, id(req), req.body));
});
expenseRouter.delete('/:id', async (req, res) => {
  await service.deleteClaim(req.user!, id(req));
  res.status(204).send();
});
