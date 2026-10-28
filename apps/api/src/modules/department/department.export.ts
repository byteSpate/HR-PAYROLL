import type { Request, Response } from 'express';
import { parseExportFormat, sendExport, type ExportSpec } from '@erp/export';
import { listDepartments } from './department.service.js';

export async function exportDepartments(req: Request, res: Response): Promise<void> {
  const format = parseExportFormat(req.query['format']);
  const rows = await listDepartments();
  const spec: ExportSpec = {
    title: 'Departments',
    columns: [
      { header: 'name', type: 'text' },
      { header: 'employees', type: 'integer' },
    ],
    rows: rows.map((d) => [d.name, d.employeeCount]),
  };
  await sendExport({ res, spec, format, baseName: 'departments', actor: req.user!, list: 'DEPARTMENTS' });
}
