import { Router } from 'express';
import { draftRunBody, preflightQuery, reverseRunBody, runQuery } from '@erp/contracts/asset';
import { requireAuth } from '../../../middleware/require-auth.js';
import { requirePermission } from '../../../middleware/require-permission.js';
import { depreciationPreflight } from './depreciation.preflight.js';
import * as service from './depreciation.service.js';

export const depreciationRouter = Router();

depreciationRouter.use(requireAuth, requirePermission('asset.capitalise'));

const id = (req: { params: Record<string, unknown> }) => String(req.params['id']);

depreciationRouter.get('/preflight', async (req, res) => {
  res.json(await depreciationPreflight(preflightQuery.parse(req.query)));
});
depreciationRouter.get('/', async (req, res) => {
  res.json(await service.listRuns(runQuery.parse(req.query)));
});
depreciationRouter.post('/', async (req, res) => {
  res.status(201).json(await service.draftRun(req.user!, draftRunBody.parse(req.body)));
});
depreciationRouter.get('/:id', async (req, res) => {
  res.json(await service.getRun(id(req)));
});
depreciationRouter.post('/:id/post', async (req, res) => {
  res.json(await service.postRun(req.user!, id(req)));
});
depreciationRouter.post('/:id/reverse', async (req, res) => {
  res.json(await service.reverseRun(req.user!, id(req), reverseRunBody.parse(req.body)));
});
depreciationRouter.delete('/:id', async (req, res) => {
  await service.deleteRun(req.user!, id(req));
  res.status(204).send();
});
