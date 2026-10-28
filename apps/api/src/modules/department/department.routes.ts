import { Router } from 'express';
import { uploadSingle } from '@erp/attachments';
import { commitHandler, guideHandler, previewHandler, templateHandler } from '@erp/export';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { exportDepartments } from './department.export.js';
import {
  DEPARTMENT_IMPORT_COLUMNS,
  commitDepartmentImport,
  departmentImportSampleRows,
  previewDepartmentImport,
} from './department.import.js';
import * as service from './department.service.js';

export const departmentRouter = Router();

// Browsers label CSV inconsistently, so both common types are accepted alongside xlsx.
const spreadsheet = uploadSingle('file', {
  maxBytes: 15 * 1024 * 1024,
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/vnd.ms-excel',
  ],
});

departmentRouter.use(requireAuth);

const canImport = requirePermission('department.import');
departmentRouter.get('/import/guide', canImport, guideHandler(DEPARTMENT_IMPORT_COLUMNS));
departmentRouter.get(
  '/import/template',
  canImport,
  templateHandler({ columns: DEPARTMENT_IMPORT_COLUMNS, sampleRows: departmentImportSampleRows, baseName: 'departments' }),
);
departmentRouter.post('/import/preview', canImport, spreadsheet, previewHandler(previewDepartmentImport));
departmentRouter.post('/import/commit', canImport, spreadsheet, commitHandler(commitDepartmentImport));

departmentRouter.get('/export', requirePermission('department.read'), exportDepartments);

departmentRouter.get('/', requirePermission('department.read'), async (_req, res) => {
  res.json(await service.listDepartments());
});

const canManage = requirePermission('department.manage');
departmentRouter.post('/', canManage, async (req, res) => {
  res.status(201).json(await service.createDepartment(req.body, req.user!.sub));
});
departmentRouter.patch('/:id', canManage, async (req, res) => {
  res.json(await service.renameDepartment(String(req.params['id']), req.body, req.user!.sub));
});
departmentRouter.delete('/:id', canManage, async (req, res) => {
  await service.deleteDepartment(String(req.params['id']), req.user!.sub);
  res.status(204).send();
});
