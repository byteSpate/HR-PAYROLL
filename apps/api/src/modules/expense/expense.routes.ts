/// <reference types="multer" />
// req.file comes from multer, applied by uploadSingle in @erp/attachments.
import { Router } from 'express';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { storageReady, uploadSingle } from '@erp/attachments';
import { claimQuery } from '@erp/contracts/expense';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import * as categories from './expense.category.service.js';
import * as decisions from './expense.decisions.js';
import * as media from './expense.media.js';
import { getOutstandingReimbursements } from './expense.outstanding.js';
import { getExpenseReport, parseReportQuery, reportFilename, reportToCsv } from './expense.report.js';
import { renderExpenseReportPdf } from './expense.report.pdf.js';
import * as service from './expense.service.js';

export const expenseRouter = Router();

const receiptFile = uploadSingle('file', { maxBytes: 15 * 1024 * 1024, mimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] });

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
expenseRouter.get('/report', async (req, res) => {
  const { format, ...query } = parseReportQuery(req.query);
  const report = await getExpenseReport(req.user!, query);
  if (format === 'json') {
    res.json(report);
    return;
  }
  await prisma.$transaction((tx) =>
    writeAudit(tx, { entity: 'EXPENSE_REPORT', entityId: `${report.from}..${report.to}`, action: 'EXPORT', changedBy: req.user!.sub, after: { rows: report.rows.length, status: report.status } }),
  );
  if (format === 'pdf') {
    const pdf = await renderExpenseReportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(report, 'pdf')}"`);
    res.status(200).send(pdf);
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${reportFilename(report, 'csv')}"`);
  // A byte order mark, so Excel opens the file as UTF-8 instead of showing every Bengali name as garbage.
  res.status(200).send(`\uFEFF${reportToCsv(report)}`);
});
expenseRouter.get('/outstanding-reimbursements', requirePermission('expense.manage'), async (req, res) => {
  res.json(await getOutstandingReimbursements(req.user!));
});
expenseRouter.get('/me', async (req, res) => {
  res.json(await service.getMyClaims(req.user!));
});
expenseRouter.get('/', requirePermission('expense.read'), async (req, res) => {
  res.json(await service.listClaims(req.user!, claimQuery.parse(req.query)));
});
expenseRouter.post('/', async (req, res) => {
  res.status(201).json(await service.createClaim(req.user!, req.body));
});

expenseRouter.post('/batch-approve', requirePermission('expense.approve'), async (req, res) => {
  res.json(await decisions.approveClaims(req.user!, req.body));
});

expenseRouter.get('/receipts/:id/url', async (req, res) => {
  res.json(await media.receiptUrl(req.user!, id(req)));
});
expenseRouter.delete('/receipts/:id', async (req, res) => {
  await media.deleteReceipt(req.user!, id(req));
  res.status(204).send();
});

expenseRouter.get('/:id/receipts', async (req, res) => {
  res.json(await media.listReceipts(req.user!, id(req)));
});
expenseRouter.post('/:id/receipts', storageReady, receiptFile, async (req, res) => {
  res.status(201).json(await media.uploadReceipt(req.user!, id(req), req.file));
});

expenseRouter.get('/:id', async (req, res) => {
  res.json(await service.getClaim(req.user!, id(req)));
});
expenseRouter.post('/:id/approve', requirePermission('expense.approve'), async (req, res) => {
  res.json(await decisions.approveClaim(req.user!, id(req), req.body));
});
expenseRouter.post('/:id/reject', requirePermission('expense.approve'), async (req, res) => {
  res.json(await decisions.rejectClaim(req.user!, id(req), req.body));
});
expenseRouter.patch('/:id', async (req, res) => {
  res.json(await service.updateClaim(req.user!, id(req), req.body));
});
expenseRouter.delete('/:id', async (req, res) => {
  await service.deleteClaim(req.user!, id(req));
  res.status(204).send();
});
