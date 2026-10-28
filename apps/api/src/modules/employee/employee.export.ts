import type { Request, Response } from 'express';
import { scopeFor } from '@erp/auth';
import { prisma } from '@erp/db';
import { parseExportFormat, sendExport, type ExportColumn, type ExportSpec } from '@erp/export';
import { AppError } from '@erp/utils';
import { EMPLOYEE_INCLUDE } from './employee.access.js';
import { scopeWhere, viewerEmployeeOf } from './employee.service.js';

const WORK: ExportColumn[] = [
  { header: 'employeeCode', type: 'text' },
  { header: 'fullName', type: 'text' },
  { header: 'designation', type: 'text' },
  { header: 'department', type: 'text' },
  { header: 'email', type: 'text' },
  { header: 'phone', type: 'text' },
  { header: 'employmentType', type: 'text' },
  { header: 'employmentStatus', type: 'text' },
  { header: 'joiningDate', type: 'date' },
];
const PERSONAL: ExportColumn[] = ['dateOfBirth', 'gender', 'nationalId', 'bloodGroup', 'maritalStatus', 'presentAddress', 'permanentAddress', 'emergencyContact'].map(
  (header) => ({ header, type: header === 'dateOfBirth' ? ('date' as const) : ('text' as const) }),
);
const MONEY: ExportColumn[] = ['bankAccountNumber', 'bankName', 'bankRoutingNumber'].map((header) => ({ header, type: 'text' as const }));

/** Columns follow the viewer's tier: a read grant (HR) sees personal data; bank access alone does not. */
export async function exportEmployees(req: Request, res: Response): Promise<void> {
  const viewer = req.user!;
  const format = parseExportFormat(req.query['format']);
  const viewerEmployee = await viewerEmployeeOf(prisma, viewer.sub);
  const where = scopeWhere(viewer, viewerEmployee);
  if (where === null) throw new AppError(403, 'Forbidden');
  const hr = scopeFor(viewer, 'employee.read') === 'all' || scopeFor(viewer, 'employee.read') === 'department';
  const columns = [...WORK, ...(hr ? PERSONAL : []), ...MONEY];

  const rows = await prisma.employee.findMany({ where, include: EMPLOYEE_INCLUDE, orderBy: { fullName: 'asc' } });
  const spec: ExportSpec = {
    title: 'Employees',
    columns,
    rows: rows.map((e) => {
      const flat: Record<string, unknown> = { ...e, department: e.department.name, email: e.user.email };
      return columns.map((c) => (flat[c.header] ?? null) as never);
    }),
  };
  await sendExport({ res, spec, format, baseName: 'employees', actor: viewer, list: 'EMPLOYEES' });
}
