import { writeAudit } from '@erp/audit';
import { dec, prisma, type AssetCondition, type Currency } from '@erp/db';
import { emit } from '@erp/events';
import {
  cellText,
  isValidIsoDate,
  parseDateOnly,
  runCommit,
  runPreview,
  type ColumnSpec,
  type ImportPreview,
  type ImportSpec,
  type ParsedRow,
  type RowIssue,
  type SampleRow,
} from '@erp/export';
import type { Viewer } from '../employee/employee.access.js';
import { nextAssetTag } from './asset.service.js';

// The register importer is thin by design: parsing, the per-row report and the all-or-nothing transaction live in
// the shared import kit. This file supplies a column spec, a row validator and a writer.
//
// The import must carry current custody, or the register is worse than useless. Without `assignedToEmployeeCode`,
// day one reports every laptop as available and the first thing anyone does is hand out one that is already on
// somebody's desk. An imported assignment gets `assignedBy` set to the importing user, `acknowledgedAt: null`
// and an IMPORT audit row, so migrated custody is visibly migrated rather than passing as a witnessed handover.

export const ASSET_IMPORT_COLUMNS: ColumnSpec[] = [
  {
    header: 'assetTag',
    required: false,
    uniqueInFile: true,
    type: 'text',
    description:
      'The asset tag, like BS-AST-0042. Leave it blank and the system makes one. It must not already be in use.',
    example: 'BS-AST-0101',
  },
  {
    header: 'categoryCode',
    required: true,
    type: 'text',
    description:
      'The code of an asset category, like LAPTOP. The category must already exist in Asset categories.',
    example: 'LAPTOP',
  },
  {
    header: 'name',
    required: true,
    type: 'text',
    description: 'What the asset is called.',
    example: 'Dell Latitude 5440',
  },
  {
    header: 'serialNumber',
    required: false,
    uniqueInFile: true,
    type: 'text',
    description:
      'The maker’s serial number. It is required for categories that track serial numbers. It must be different for every asset.',
    example: 'SN-0001',
  },
  {
    header: 'model',
    required: false,
    type: 'text',
    description: 'The model name.',
    example: 'Latitude 5440',
  },
  {
    header: 'purchaseDate',
    required: false,
    type: 'date',
    description: 'The day it was bought, written YYYY-MM-DD.',
    example: '2026-01-15',
  },
  {
    header: 'purchaseCost',
    required: false,
    type: 'decimal',
    description: 'The price paid, as a number with no currency sign, like 95000 or 95000.50.',
    example: '95000',
  },
  {
    header: 'currency',
    required: false,
    type: 'choice',
    allowed: ['BDT', 'USD'],
    description: 'The currency of the price. Leave blank for BDT.',
    example: 'BDT',
  },
  {
    header: 'vendor',
    required: false,
    type: 'text',
    description: 'The company it was bought from.',
    example: 'Star Tech Ltd',
  },
  {
    header: 'warrantyExpiry',
    required: false,
    type: 'date',
    description: 'The last day of the warranty, written YYYY-MM-DD.',
    example: '2029-01-14',
  },
  {
    header: 'departmentName',
    required: false,
    type: 'text',
    description:
      'The department that has the asset. If the name is not in the system yet, the system adds that department.',
    example: 'Finance',
  },
  {
    header: 'location',
    required: false,
    type: 'text',
    description: 'Where the asset is kept.',
    example: 'Head office',
  },
  { header: 'notes', required: false, type: 'text', description: 'Any other note.', example: '' },
  {
    header: 'assignedToEmployeeCode',
    required: false,
    type: 'text',
    description:
      'The employee code of the person who holds the asset now. Fill assignedAt too. The employee must be active.',
    example: 'EMP-0001',
  },
  {
    header: 'assignedAt',
    required: false,
    type: 'date',
    description:
      'The day that person got the asset, written YYYY-MM-DD. It cannot be in the future.',
    example: '2026-02-01',
  },
  {
    header: 'conditionOut',
    required: false,
    type: 'choice',
    allowed: ['NEW', 'GOOD', 'FAIR', 'DAMAGED'],
    description: 'The condition of the asset when it was handed over.',
    example: 'GOOD',
  },
];

/** Two rows that pass the importer’s own checks when the categories LAPTOP and CHAIR and the department Finance exist. */
export function assetImportSampleRows(): SampleRow[] {
  return [
    {
      assetTag: '',
      categoryCode: 'LAPTOP',
      name: 'Dell Latitude 5440',
      serialNumber: 'SN-0001',
      model: 'Latitude 5440',
      purchaseDate: '2026-01-15',
      purchaseCost: '95000',
      currency: 'BDT',
      vendor: 'Star Tech Ltd',
      warrantyExpiry: '2029-01-14',
      departmentName: 'Finance',
      location: 'Head office',
      notes: '',
      assignedToEmployeeCode: '',
      assignedAt: '',
      conditionOut: '',
    },
    {
      assetTag: '',
      categoryCode: 'CHAIR',
      name: 'Office chair',
      serialNumber: '',
      model: '',
      purchaseDate: '2026-02-10',
      purchaseCost: '12000',
      currency: 'BDT',
      vendor: '',
      warrantyExpiry: '',
      departmentName: 'Finance',
      location: 'Head office',
      notes: '',
      assignedToEmployeeCode: '',
      assignedAt: '',
      conditionOut: '',
    },
  ];
}

const CONDITIONS: readonly AssetCondition[] = ['NEW', 'GOOD', 'FAIR', 'DAMAGED'];
const CURRENCIES: readonly Currency[] = ['BDT', 'USD'];
/** Asset.purchaseCost is Decimal(14,2). */
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

interface AssetImportRow {
  rowNumber: number;
  assetTag?: string;
  categoryId: string;
  name: string;
  serialNumber?: string;
  model?: string;
  purchaseDate?: string;
  purchaseCost?: string;
  currency?: Currency;
  vendor?: string;
  warrantyExpiry?: string;
  /** Resolved against an existing department. */
  departmentId?: string;
  /** Set instead of `departmentId` when the name did not resolve: created at commit, which is the person’s confirmation. */
  departmentName?: string;
  location?: string;
  notes?: string;
  assignedToEmployeeId?: string;
  assignedAt?: string;
  conditionOut?: AssetCondition;
}

interface ImportContext {
  categoriesByCode: Map<string, { id: string; name: string; requiresSerial: boolean }>;
  employeesByCode: Map<string, { id: string }>;
  departmentsByName: Map<string, string>;
}

async function loadImportContext(): Promise<ImportContext> {
  const [categories, employees, departments] = await Promise.all([
    prisma.assetCategory.findMany(),
    // Only active employees can receive custody: a former employee’s code resolves to nobody, exactly like an unknown one.
    prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE' },
      select: { id: true, employeeCode: true },
    }),
    prisma.department.findMany({ select: { id: true, name: true } }),
  ]);
  return {
    categoriesByCode: new Map(categories.map((c) => [c.code.toUpperCase(), c])),
    employeesByCode: new Map(employees.map((e) => [e.employeeCode.toUpperCase(), e])),
    departmentsByName: new Map(departments.map((d) => [d.name.toLowerCase(), d.id])),
  };
}

function makeValidateRow(ctx: ImportContext) {
  return (
    row: ParsedRow,
  ): { ok: true; value: AssetImportRow } | { ok: false; issues: RowIssue[] } => {
    const issues: RowIssue[] = [];
    const cell = (key: string) => cellText(row.values, key);
    const flag = (column: string, message: string) =>
      issues.push({ rowNumber: row.rowNumber, column, message });

    const categoryCode = cell('categoryCode');
    const category = ctx.categoriesByCode.get(categoryCode.toUpperCase());
    if (!category) flag('categoryCode', `Unknown category code "${categoryCode}"`);

    const serialNumber = cell('serialNumber') || undefined;
    if (category?.requiresSerial && !serialNumber)
      flag('serialNumber', `A serial number is required for ${category.name}`);

    const purchaseCost = cell('purchaseCost') || undefined;
    if (purchaseCost !== undefined && !MONEY.test(purchaseCost))
      flag('purchaseCost', 'purchaseCost must be a non-negative number with at most two decimals');

    let currency: Currency | undefined;
    const currencyRaw = cell('currency').toUpperCase();
    if (currencyRaw) {
      if (CURRENCIES.includes(currencyRaw as Currency)) currency = currencyRaw as Currency;
      else flag('currency', `Unknown currency "${currencyRaw}"`);
    }

    let conditionOut: AssetCondition | undefined;
    const conditionRaw = cell('conditionOut').toUpperCase();
    if (conditionRaw) {
      if (CONDITIONS.includes(conditionRaw as AssetCondition))
        conditionOut = conditionRaw as AssetCondition;
      else flag('conditionOut', `Unknown condition "${conditionRaw}"`);
    }

    const dateCell = (header: string): string | undefined => {
      const raw = cell(header);
      if (!raw) return undefined;
      if (isValidIsoDate(raw)) return raw;
      flag(header, 'Expected a YYYY-MM-DD date');
      return undefined;
    };
    const purchaseDate = dateCell('purchaseDate');
    const warrantyExpiry = dateCell('warrantyExpiry');

    let departmentId: string | undefined;
    let departmentName: string | undefined;
    const departmentRaw = cell('departmentName');
    if (departmentRaw) {
      const existing = ctx.departmentsByName.get(departmentRaw.toLowerCase());
      // Not resolving is not an error: the preview counts it as a department to create, and commit creates it.
      if (existing) departmentId = existing;
      else departmentName = departmentRaw;
    }

    let assignedToEmployeeId: string | undefined;
    let assignedAt: string | undefined;
    const employeeCode = cell('assignedToEmployeeCode');
    const assignedAtRaw = cell('assignedAt');
    if (employeeCode && !assignedAtRaw) {
      flag('assignedAt', 'assignedAt is required when assignedToEmployeeCode is set');
    } else if (assignedAtRaw && !employeeCode) {
      flag('assignedToEmployeeCode', 'assignedToEmployeeCode is required when assignedAt is set');
    } else if (employeeCode && assignedAtRaw) {
      const employee = ctx.employeesByCode.get(employeeCode.toUpperCase());
      if (employee) assignedToEmployeeId = employee.id;
      else flag('assignedToEmployeeCode', `Unknown or inactive employee code "${employeeCode}"`);

      if (!isValidIsoDate(assignedAtRaw)) flag('assignedAt', 'Expected a YYYY-MM-DD date');
      else if (parseDateOnly(assignedAtRaw).getTime() > Date.now())
        flag('assignedAt', 'assignedAt cannot be in the future');
      else if (purchaseDate && assignedAtRaw < purchaseDate)
        flag('assignedAt', 'assignedAt cannot be before purchaseDate');
      else assignedAt = assignedAtRaw;
    }

    if (issues.length > 0 || !category) return { ok: false, issues };
    const text = (key: string) => cell(key) || undefined;
    return {
      ok: true,
      value: {
        rowNumber: row.rowNumber,
        assetTag: text('assetTag'),
        categoryId: category.id,
        name: cell('name'),
        serialNumber,
        model: text('model'),
        purchaseDate,
        purchaseCost,
        currency,
        vendor: text('vendor'),
        warrantyExpiry,
        departmentId,
        departmentName,
        location: text('location'),
        notes: text('notes'),
        assignedToEmployeeId,
        assignedAt,
        conditionOut,
      },
    };
  };
}

/** A tag or serial that already exists is a duplicate whether or not it repeats inside this file; only the database can say. */
async function validateAllRows(rows: AssetImportRow[]): Promise<RowIssue[]> {
  const tags = rows.map((r) => r.assetTag).filter((t): t is string => Boolean(t));
  const serials = rows.map((r) => r.serialNumber).filter((s): s is string => Boolean(s));
  if (tags.length === 0 && serials.length === 0) return [];

  const existing = await prisma.asset.findMany({
    where: {
      OR: [
        ...(tags.length ? [{ assetTag: { in: tags } }] : []),
        ...(serials.length ? [{ serialNumber: { in: serials } }] : []),
      ],
    },
    select: { assetTag: true, serialNumber: true },
  });
  const existingTags = new Set(existing.map((a) => a.assetTag));
  const existingSerials = new Set(
    existing.map((a) => a.serialNumber).filter((s): s is string => Boolean(s)),
  );

  const issues: RowIssue[] = [];
  for (const row of rows) {
    if (row.assetTag && existingTags.has(row.assetTag))
      issues.push({
        rowNumber: row.rowNumber,
        column: 'assetTag',
        message: `Asset tag "${row.assetTag}" already exists`,
      });
    if (row.serialNumber && existingSerials.has(row.serialNumber))
      issues.push({
        rowNumber: row.rowNumber,
        column: 'serialNumber',
        message: `Serial number "${row.serialNumber}" already exists`,
      });
  }
  return issues;
}

function summariseRows(rows: AssetImportRow[]): Record<string, number> {
  const departmentsToCreate = new Set(
    rows.filter((r) => r.departmentName).map((r) => r.departmentName!.toLowerCase()),
  ).size;
  return {
    assets: rows.length,
    assignments: rows.filter((r) => r.assignedToEmployeeId).length,
    departmentsToCreate,
  };
}

const buildSpec = (ctx: ImportContext): ImportSpec<AssetImportRow> => ({
  columns: ASSET_IMPORT_COLUMNS,
  validateRow: makeValidateRow(ctx),
  validateAll: validateAllRows,
  summarise: summariseRows,
});

export async function previewAssetImport(
  buffer: Buffer,
  fileName: string,
): Promise<ImportPreview<AssetImportRow>> {
  return runPreview(buffer, fileName, buildSpec(await loadImportContext()));
}

/**
 * Two passes inside one transaction: every asset first, then every assignment, since a referenced row
 * routinely sits below the row referencing it.
 */
async function writeImport(
  rows: AssetImportRow[],
  actorUserId: string,
): Promise<{ assetCount: number; assignmentCount: number }> {
  return prisma.$transaction(async (tx) => {
    // Move the counter past the highest explicitly imported tag BEFORE generating any automatic one in this
    // transaction, so an automatic tag can never collide with an explicit one from the same file.
    const highest = rows.reduce((max, r) => {
      const match = r.assetTag?.match(/^BS-AST-(\d+)$/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    if (highest > 0) {
      const current = await tx.idCounter.findUnique({ where: { id: 'AST' } });
      const next = Math.max(current?.value ?? 0, highest);
      await tx.idCounter.upsert({
        where: { id: 'AST' },
        update: { value: next },
        create: { id: 'AST', value: next },
      });
    }

    // A department named but not yet known is created here; committing is the person’s explicit confirmation.
    const created = new Map<string, string>();
    const departmentIdFor = async (name: string) => {
      const key = name.toLowerCase();
      const cached = created.get(key);
      if (cached) return cached;
      const department = await tx.department.create({ data: { name } });
      created.set(key, department.id);
      return department.id;
    };

    const assets: { id: string }[] = [];
    for (const row of rows) {
      const departmentId =
        row.departmentId ?? (row.departmentName ? await departmentIdFor(row.departmentName) : null);
      const asset = await tx.asset.create({
        data: {
          assetTag: row.assetTag ?? (await nextAssetTag(tx)),
          categoryId: row.categoryId,
          name: row.name,
          serialNumber: row.serialNumber ?? null,
          model: row.model ?? null,
          notes: row.notes ?? null,
          purchaseDate: row.purchaseDate ? parseDateOnly(row.purchaseDate) : null,
          purchaseCost: row.purchaseCost === undefined ? null : dec(row.purchaseCost),
          currency: row.currency ?? 'BDT',
          vendor: row.vendor ?? null,
          warrantyExpiry: row.warrantyExpiry ? parseDateOnly(row.warrantyExpiry) : null,
          departmentId,
          location: row.location ?? null,
        },
      });
      await writeAudit(tx, {
        entity: 'ASSET',
        entityId: asset.id,
        action: 'IMPORT',
        changedBy: actorUserId,
        after: { assetTag: asset.assetTag, name: row.name, categoryId: row.categoryId },
      });
      assets.push(asset);
    }

    let assignmentCount = 0;
    for (const [i, row] of rows.entries()) {
      if (!row.assignedToEmployeeId || !row.assignedAt) continue;
      const assignment = await tx.assetAssignment.create({
        data: {
          assetId: assets[i]!.id,
          employeeId: row.assignedToEmployeeId,
          assignedAt: parseDateOnly(row.assignedAt),
          assignedBy: actorUserId,
          conditionOut: row.conditionOut ?? 'GOOD',
          issueNote: null,
          acknowledgedAt: null,
        },
      });
      await writeAudit(tx, {
        entity: 'ASSET_ASSIGNMENT',
        entityId: assignment.id,
        action: 'IMPORT',
        changedBy: actorUserId,
        after: { assetId: assets[i]!.id, employeeId: row.assignedToEmployeeId },
      });
      assignmentCount += 1;
    }

    // One event for the whole file, never one per row: 142 feed lines would bury every real notification.
    await emit(tx, 'asset.imported', { assetCount: assets.length, assignmentCount, actorUserId });
    return { assetCount: assets.length, assignmentCount };
  });
}

export async function commitAssetImport(
  buffer: Buffer,
  fileName: string,
  actor: Pick<Viewer, 'sub'>,
) {
  return runCommit(buffer, fileName, buildSpec(await loadImportContext()), (rows) =>
    writeImport(rows, actor.sub),
  );
}
