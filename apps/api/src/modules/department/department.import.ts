import { departmentInputSchema } from '@erp/contracts/department';
import { prisma } from '@erp/db';
import { writeAudit } from '@erp/audit';
import {
  cellText,
  runCommit,
  runPreview,
  zodIssues,
  type Actor,
  type ColumnSpec,
  type ImportPreview,
  type ImportSpec,
  type ParsedRow,
  type RowIssue,
  type SampleRow,
} from '@erp/export';

// Ported from HR-MNG-V1 without costNature, which only fed accounting.
export const DEPARTMENT_IMPORT_COLUMNS: ColumnSpec[] = [
  {
    header: 'name',
    required: true,
    uniqueInFile: true,
    caseInsensitive: true,
    type: 'text',
    maxLength: 100,
    description: 'The department name. It must not already be in the system.',
    example: 'Finance',
  },
];

export const departmentImportSampleRows = (): SampleRow[] => [{ name: 'Finance' }, { name: 'Field Service' }];

export interface DepartmentImportRow {
  rowNumber: number;
  name: string;
}

function validateRow(row: ParsedRow): { ok: true; value: DepartmentImportRow } | { ok: false; issues: RowIssue[] } {
  const parsed = departmentInputSchema.safeParse({ name: cellText(row.values, 'name') });
  if (!parsed.success) return { ok: false, issues: zodIssues(row.rowNumber, parsed.error) };
  return { ok: true, value: { rowNumber: row.rowNumber, name: parsed.data.name } };
}

// Names are unique ignoring case, so "finance" in the file clashes with "Finance" already stored.
async function validateAll(rows: DepartmentImportRow[]): Promise<RowIssue[]> {
  const existing = await prisma.department.findMany({
    where: { OR: rows.map((r) => ({ name: { equals: r.name, mode: 'insensitive' as const } })) },
    select: { name: true },
  });
  const taken = new Set(existing.map((d) => d.name.toLowerCase()));
  return rows
    .filter((r) => taken.has(r.name.toLowerCase()))
    .map((r) => ({
      rowNumber: r.rowNumber,
      column: 'name',
      message: `"${r.name}" is already in the system. Change it or remove the row.`,
    }));
}

const spec: ImportSpec<DepartmentImportRow> = {
  columns: DEPARTMENT_IMPORT_COLUMNS,
  validateRow,
  validateAll: (rows) => (rows.length === 0 ? Promise.resolve([]) : validateAll(rows)),
  summarise: (rows) => ({ departments: rows.length }),
};

export function previewDepartmentImport(buffer: Buffer, fileName: string): Promise<ImportPreview<DepartmentImportRow>> {
  return runPreview(buffer, fileName, spec);
}

export function commitDepartmentImport(buffer: Buffer, fileName: string, actor: Actor): Promise<{ created: number }> {
  return runCommit(buffer, fileName, spec, (rows) =>
    prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const d = await tx.department.create({ data: { name: row.name } });
        await writeAudit(tx, { entity: 'DEPARTMENT', entityId: d.id, action: 'IMPORT', changedBy: actor.sub, after: { name: row.name } });
      }
      return { created: rows.length };
    }),
  );
}
