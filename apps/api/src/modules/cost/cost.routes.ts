/// <reference types="multer" />
import { Router } from 'express';
import { storageReady, uploadSingle } from '@erp/attachments';
import { listCommitmentsQuery, summaryQuery } from '@erp/contracts/cost';
import { commitHandler, guideHandler, previewHandler, templateHandler } from '@erp/export';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import {
  COST_IMPORT_COLUMNS,
  commitCostImport,
  costImportSampleRows,
  previewCostImport,
} from './cost.import.js';
import { exportCostsHandler } from './cost.export.js';
import * as media from './cost.media.js';
import * as service from './cost.service.js';
import { monthlySummary } from './cost.summary.js';

export const costRouter = Router();

const receiptFile = uploadSingle('file', {
  maxBytes: 15 * 1024 * 1024,
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
});
const sheetFile = uploadSingle('file', {
  maxBytes: 5 * 1024 * 1024,
  mimeTypes: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
});
const read = requirePermission(['cost.read', 'cost.manage']);
const manage = requirePermission('cost.manage');
const config = requirePermission('cost.config');
const id = (req: { params: Record<string, unknown> }) => String(req.params['id']);

costRouter.use(requireAuth);

// Literal paths before '/:id' so they are never read as an id.
costRouter.get(
  '/categories',
  requirePermission(['cost.read', 'cost.manage', 'cost.config']),
  async (_req, res) => {
    res.json(await service.listCategories());
  },
);
costRouter.post('/categories', config, async (req, res) => {
  res.status(201).json(await service.createCategory(req.user!.sub, req.body));
});
costRouter.patch('/categories/:id', config, async (req, res) => {
  res.json(await service.updateCategory(req.user!.sub, id(req), req.body));
});
costRouter.delete('/categories/:id', config, async (req, res) => {
  await service.deleteCategory(req.user!.sub, id(req));
  res.status(204).send();
});

costRouter.get('/commitments', read, async (req, res) => {
  res.json(await service.listCommitments(listCommitmentsQuery.parse(req.query).active));
});
costRouter.post('/commitments', manage, async (req, res) => {
  res.status(201).json(await service.createCommitment(req.user!.sub, req.body));
});
costRouter.patch('/commitments/:id', manage, async (req, res) => {
  res.json(await service.updateCommitment(req.user!.sub, id(req), req.body));
});

costRouter.get('/summary', read, async (req, res) => {
  const { year, month } = summaryQuery.parse(req.query);
  res.json(await monthlySummary(year, month));
});

costRouter.get('/receipts/:id/url', read, async (req, res) => {
  res.json(await media.receiptUrl(id(req)));
});
costRouter.delete('/receipts/:id', manage, async (req, res) => {
  await media.deleteReceipt(req.user!.sub, id(req));
  res.status(204).send();
});

costRouter.get('/export', manage, exportCostsHandler);
costRouter.get('/import/guide', manage, guideHandler(COST_IMPORT_COLUMNS));
costRouter.get(
  '/import/template',
  manage,
  templateHandler({
    columns: COST_IMPORT_COLUMNS,
    sampleRows: costImportSampleRows,
    baseName: 'operating-costs',
  }),
);
costRouter.post('/import/preview', manage, sheetFile, previewHandler(previewCostImport));
costRouter.post('/import/commit', manage, sheetFile, commitHandler(commitCostImport));

costRouter.get('/', read, async (req, res) => {
  res.json(await service.listCosts(service.parseListQuery(req.query)));
});
costRouter.post('/', manage, async (req, res) => {
  res.status(201).json(await service.createCost(req.user!.sub, req.body));
});
costRouter.get('/:id', read, async (req, res) => {
  res.json(await service.getCost(id(req)));
});
costRouter.patch('/:id', manage, async (req, res) => {
  res.json(await service.updateCost(req.user!.sub, id(req), req.body));
});
costRouter.post('/:id/pay', manage, async (req, res) => {
  res.json(await service.payCost(req.user!.sub, id(req), req.body));
});
costRouter.get('/:id/receipts', read, async (req, res) => {
  res.json(await media.listReceipts(id(req)));
});
costRouter.post('/:id/receipts', manage, storageReady, receiptFile, async (req, res) => {
  res.status(201).json(await media.uploadReceipt(req.user!.sub, id(req), req.file));
});
