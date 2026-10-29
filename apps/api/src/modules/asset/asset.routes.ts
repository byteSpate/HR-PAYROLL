/// <reference types="multer" />
import { Router } from 'express';
import { storageReady, uploadSingle } from '@erp/attachments';
import { commitHandler, guideHandler, previewHandler, templateHandler } from '@erp/export';
import {
  approveRequestBody,
  valueReportQuery,
  attachmentKindBody,
  assignBody,
  cancelRequestBody,
  createAssetBody,
  createRecoveryBody,
  fulfilRequestBody,
  lifecycleBody,
  listAssetsQuery,
  markOrderedBody,
  receiveRepairBody,
  recoveryQuery,
  rejectRequestBody,
  repairQuery,
  returnBody,
  sendRepairBody,
  submitRequestBody,
  updateAssetBody,
  updateRecoveryBody,
  waiveRecoveryBody,
} from '@erp/contracts/asset';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { scopeForViewer } from '../employee/employee.scope.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { exportAssetsHandler } from './asset.export.js';
import {
  ASSET_IMPORT_COLUMNS,
  assetImportSampleRows,
  commitAssetImport,
  previewAssetImport,
} from './asset.import.js';
import * as media from './asset.media.js';
import * as capital from './asset.capitalise.js';
import * as assignments from './asset.assignments.js';
import * as categories from './asset.category.service.js';
import * as recoveries from './asset.recoveries.js';
import * as repairs from './asset.repairs.js';
import * as requests from './asset.requests.js';
import { exitChecklist } from './asset.exit.js';
import { assetValueReport } from './asset.value.js';
import * as service from './asset.service.js';

export const assetRouter = Router();

assetRouter.use(requireAuth);

const attachmentFile = uploadSingle('file', {
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

const id = (req: { params: Record<string, unknown> }) => String(req.params['id']);

// Literal paths before '/:id' so they are never read as an id.
assetRouter.get('/categories', async (_req, res) => {
  res.json(await categories.listCategories());
});
assetRouter.post('/categories', requirePermission('asset.config'), async (req, res) => {
  res.status(201).json(await categories.createCategory(req.user!.sub, req.body));
});
assetRouter.patch('/categories/:id', requirePermission('asset.config'), async (req, res) => {
  res.json(await categories.updateCategory(req.user!.sub, id(req), req.body));
});
assetRouter.delete('/categories/:id', requirePermission('asset.config'), async (req, res) => {
  await categories.deleteCategory(req.user!.sub, id(req));
  res.status(204).send();
});

assetRouter.get('/value', requirePermission('asset.value'), async (req, res) => {
  res.json(await assetValueReport(valueReportQuery.parse(req.query)));
});

assetRouter.get('/recoveries', async (req, res) => {
  res.json(await recoveries.listRecoveries(req.user!, recoveryQuery.parse(req.query)));
});
assetRouter.post('/recoveries', requirePermission('asset.manage'), async (req, res) => {
  res
    .status(201)
    .json(await recoveries.createRecovery(req.user!, createRecoveryBody.parse(req.body)));
});
assetRouter.patch('/recoveries/:id', requirePermission('asset.manage'), async (req, res) => {
  res.json(await recoveries.updateRecovery(req.user!, id(req), updateRecoveryBody.parse(req.body)));
});
assetRouter.post('/recoveries/:id/recover-from-payroll', requirePermission('asset.manage'), async (req, res) => {
  res.json(await recoveries.recoverFromPayroll(req.user!, id(req)));
});
assetRouter.post('/recoveries/:id/waive', requirePermission('asset.manage'), async (req, res) => {
  res.json(await recoveries.waiveRecovery(req.user!, id(req), waiveRecoveryBody.parse(req.body)));
});

// A recovery is waived with a reason rather than deleted: "we chose not to charge her" is what an auditor asks about.
assetRouter.delete('/recoveries/:id', requirePermission('asset.manage'), (_req, res) => {
  res
    .status(405)
    .json({ error: 'Recoveries cannot be deleted. Waive one instead, which keeps the trail.' });
});

assetRouter.get('/repairs', requirePermission('asset.manage'), async (req, res) => {
  res.json(
    await repairs.listRepairs(req.user!, { open: repairQuery.parse(req.query).open === 'true' }),
  );
});
assetRouter.post('/repairs/:id/receive', requirePermission('asset.manage'), async (req, res) => {
  res.json(await repairs.receiveFromRepair(req.user!, id(req), receiveRepairBody.parse(req.body)));
});

assetRouter.post('/requests', async (req, res) => {
  res.status(201).json(await requests.submitRequest(req.user!, submitRequestBody.parse(req.body)));
});
assetRouter.get('/requests', async (req, res) => {
  res.json(await requests.listRequests(req.user!));
});
assetRouter.get('/requests/:id/timeline', async (req, res) => {
  res.json(await requests.getRequestTimeline(req.user!, id(req)));
});
assetRouter.post('/requests/:id/approve', requirePermission('asset.approve'), async (req, res) => {
  res.json(await requests.approveRequest(req.user!, id(req), approveRequestBody.parse(req.body)));
});
assetRouter.post('/requests/:id/reject', requirePermission('asset.approve'), async (req, res) => {
  res.json(await requests.rejectRequest(req.user!, id(req), rejectRequestBody.parse(req.body)));
});
// No permission guard: the requester withdraws their own and a manager of assets closes another's, and which rule applies depends on who asks.
assetRouter.post('/requests/:id/cancel', async (req, res) => {
  res.json(await requests.cancelRequest(req.user!, id(req), cancelRequestBody.parse(req.body)));
});
assetRouter.post('/requests/:id/order', requirePermission('asset.manage'), async (req, res) => {
  res.json(await requests.markOrdered(req.user!, id(req), markOrderedBody.parse(req.body)));
});
assetRouter.post('/requests/:id/fulfil', requirePermission('asset.manage'), async (req, res) => {
  res.json(await requests.fulfilRequest(req.user!, id(req), fulfilRequestBody.parse(req.body)));
});

// The exit checklist only warns; it never gates a settlement. Whoever manages the leaver's assets reads it.
assetRouter.get(
  '/exit-checklist/:employeeId',
  requirePermission('asset.manage'),
  async (req, res) => {
    const employeeId = String(req.params['employeeId']);
    const reach = await scopeForViewer(req.user!, 'asset.manage');
    if ((await prisma.employee.count({ where: { AND: [reach, { id: employeeId }] } })) === 0)
      throw new AppError(404, 'Employee not found');
    res.json(await exitChecklist(employeeId));
  },
);

assetRouter.post(
  '/import/preview',
  requirePermission('asset.manage'),
  sheetFile,
  previewHandler(previewAssetImport),
);
assetRouter.post(
  '/import/commit',
  requirePermission('asset.manage'),
  sheetFile,
  commitHandler(commitAssetImport),
);
assetRouter.get(
  '/import/guide',
  requirePermission('asset.manage'),
  guideHandler(ASSET_IMPORT_COLUMNS),
);
assetRouter.get(
  '/import/template',
  requirePermission('asset.manage'),
  templateHandler({
    columns: ASSET_IMPORT_COLUMNS,
    sampleRows: assetImportSampleRows,
    baseName: 'assets',
  }),
);
assetRouter.get('/export', requirePermission('asset.manage'), exportAssetsHandler);

assetRouter.get('/attachments/:id/url', async (req, res) => {
  res.json(await media.getAttachmentUrl(req.user!, id(req)));
});
assetRouter.delete('/attachments/:id', requirePermission('asset.manage'), async (req, res) => {
  await media.deleteAttachment(req.user!, id(req));
  res.status(204).send();
});
assetRouter.post(
  '/assignments/:id/attachments',
  requirePermission('asset.manage'),
  storageReady,
  attachmentFile,
  async (req, res) => {
    res
      .status(201)
      .json(
        await media.uploadAssignmentAttachment(
          req.user!,
          id(req),
          attachmentKindBody.parse(req.body?.kind),
          req.file,
        ),
      );
  },
);

assetRouter.get('/me', async (req, res) => {
  res.json(await assignments.myHoldings(req.user!));
});
assetRouter.get('/unacknowledged', requirePermission('asset.manage'), async (req, res) => {
  res.json(await assignments.listUnacknowledged(req.user!));
});
assetRouter.post('/assignments/:id/acknowledge', async (req, res) => {
  res.json(await assignments.acknowledgeAssignment(req.user!, id(req)));
});

assetRouter.get('/', async (req, res) => {
  res.json(await service.listAssets(req.user!, listAssetsQuery.parse(req.query)));
});
assetRouter.post('/', requirePermission('asset.manage'), async (req, res) => {
  res.status(201).json(await service.createAsset(req.user!, createAssetBody.parse(req.body)));
});
assetRouter.get('/:id', async (req, res) => {
  res.json(await service.getAsset(req.user!, id(req)));
});
assetRouter.patch('/:id', requirePermission('asset.manage'), async (req, res) => {
  res.json(await service.updateAsset(req.user!, id(req), updateAssetBody.parse(req.body)));
});
assetRouter.post('/:id/assign', requirePermission('asset.manage'), async (req, res) => {
  res
    .status(201)
    .json(await assignments.assignAsset(req.user!, id(req), assignBody.parse(req.body)));
});
assetRouter.post('/:id/return', requirePermission('asset.manage'), async (req, res) => {
  res.json(await assignments.returnAsset(req.user!, id(req), returnBody.parse(req.body)));
});
assetRouter.post('/:id/retire', requirePermission('asset.manage'), async (req, res) => {
  res.json(await service.retireAsset(req.user!, id(req), lifecycleBody.parse(req.body)));
});
assetRouter.post(
  '/:id/attachments',
  requirePermission('asset.manage'),
  storageReady,
  attachmentFile,
  async (req, res) => {
    res
      .status(201)
      .json(
        await media.uploadAssetAttachment(
          req.user!,
          id(req),
          attachmentKindBody.parse(req.body?.kind),
          req.file,
        ),
      );
  },
);
assetRouter.post('/:id/repairs', requirePermission('asset.manage'), async (req, res) => {
  res
    .status(201)
    .json(await repairs.sendForRepair(req.user!, id(req), sendRepairBody.parse(req.body)));
});
assetRouter.post('/:id/capitalise', requirePermission('asset.capitalise'), async (req, res) => {
  res.json(await capital.capitaliseAsset(req.user!, id(req)));
});
assetRouter.post('/:id/pay', requirePermission('asset.capitalise'), async (req, res) => {
  res.json(await capital.payForAsset(req.user!, id(req), req.body));
});
assetRouter.post('/:id/dispose', requirePermission('asset.capitalise'), async (req, res) => {
  res.json(await capital.disposeAsset(req.user!, id(req), req.body));
});
assetRouter.post('/:id/mark-lost', requirePermission('asset.manage'), async (req, res) => {
  res.json(await service.markAssetLost(req.user!, id(req), lifecycleBody.parse(req.body)));
});
