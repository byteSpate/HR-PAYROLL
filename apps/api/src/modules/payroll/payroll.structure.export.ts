import type { NextFunction, Request, Response } from 'express';

import { parseExportFormat, sendExport, type ExportSpec } from '@erp/export';
import { listSalaryStructures } from './payroll.structure.js';

/**
 * One text cell for the components, not one column each: kinds and calc rules
 * differ between structures, so a shared column would mix a percent and an
 * amount under one heading.
 */
function componentsText(
  components: Array<{ label: string; kind: string; calc: string; value: { toString(): string } }>,
): string {
  return components
    .map((c) => `${c.label}: ${Number(c.value.toString())} (${c.kind}, ${c.calc})`)
    .join('; ');
}

export async function buildSalaryStructureExportSpec(): Promise<ExportSpec> {
  const structures = await listSalaryStructures();
  return {
    title: 'Salary structures',
    columns: [
      { header: 'name', type: 'text' },
      { header: 'currency', type: 'text' },
      { header: 'basic', type: 'decimal' },
      { header: 'isActive', type: 'boolean' },
      { header: 'employeeCount', type: 'integer' },
      { header: 'components', type: 'text' },
    ],
    rows: structures.map((s) => [
      s.name,
      s.currency,
      Number(s.basic.toString()),
      s.isActive,
      s.employeeCount,
      componentsText(s.components),
    ]),
  };
}

export async function exportSalaryStructuresHandler(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const format = parseExportFormat(req.query['format']);
    await sendExport({
      res,
      spec: await buildSalaryStructureExportSpec(),
      format,
      baseName: 'salary-structures',
      actor: req.user!,
      list: 'SALARY_STRUCTURES',
    });
  } catch (err) {
    next(err);
  }
}
