import type { Request, Response } from 'express';
import { holidayInputSchema, holidayTypes, shiftInputSchema } from '@erp/contracts/attendance';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import {
  cellText,
  parseExportFormat,
  parseWholeNumber,
  runCommit,
  runPreview,
  sendExport,
  zodIssues,
  type Actor,
  type ColumnSpec,
  type ExportSpec,
  type ImportPreview,
  type ImportSpec,
  type ParsedRow,
  type RowIssue,
  type SampleRow,
} from '@erp/export';
import { listHolidays } from './holiday.service.js';
import { listShifts } from './shift.service.js';

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

// ── Holidays ────────────────────────────────────────────────────────────────

export const HOLIDAY_IMPORT_COLUMNS: ColumnSpec[] = [
  { header: 'date', required: true, type: 'date', description: 'The day, as YYYY-MM-DD.', example: '2026-05-01' },
  { header: 'name', required: true, type: 'text', maxLength: 120, description: 'What the day is called.', example: 'May Day' },
  {
    header: 'type',
    required: false,
    type: 'choice',
    allowed: [...holidayTypes],
    description: 'WORKING_DAY declares a normal off-day a working one. Blank means GENERAL.',
    example: 'GENERAL',
  },
];

export const holidayImportSampleRows = (): SampleRow[] => [
  { date: '2026-05-01', name: 'May Day', type: 'GENERAL' },
  { date: '2026-05-23', name: 'Eid-ul-Azha extension (working)', type: 'WORKING_DAY' },
];

interface HolidayRow {
  rowNumber: number;
  name: string;
  date: string;
  type: (typeof holidayTypes)[number];
}

function validateHolidayRow(row: ParsedRow): { ok: true; value: HolidayRow } | { ok: false; issues: RowIssue[] } {
  const parsed = holidayInputSchema.safeParse({
    date: cellText(row.values, 'date'),
    name: cellText(row.values, 'name'),
    type: cellText(row.values, 'type').toUpperCase() || undefined,
  });
  if (!parsed.success) return { ok: false, issues: zodIssues(row.rowNumber, parsed.error) };
  return { ok: true, value: { rowNumber: row.rowNumber, ...parsed.data } };
}

// (date, name) is the unique key, so it is checked inside the file and against what is stored.
async function validateHolidays(rows: HolidayRow[]): Promise<RowIssue[]> {
  const issues: RowIssue[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.date}|${r.name.toLowerCase()}`;
    if (seen.has(key)) issues.push({ rowNumber: r.rowNumber, column: 'name', message: `"${r.name}" on ${r.date} appears twice in this file.` });
    seen.add(key);
  }
  const stored = await prisma.holiday.findMany({
    where: { OR: rows.map((r) => ({ date: toDate(r.date), name: { equals: r.name, mode: 'insensitive' as const } })) },
    select: { date: true, name: true },
  });
  const taken = new Set(stored.map((h) => `${h.date.toISOString().slice(0, 10)}|${h.name.toLowerCase()}`));
  for (const r of rows) {
    if (taken.has(`${r.date}|${r.name.toLowerCase()}`)) {
      issues.push({ rowNumber: r.rowNumber, column: 'name', message: `"${r.name}" on ${r.date} is already on the calendar.` });
    }
  }
  return issues;
}

const holidaySpec: ImportSpec<HolidayRow> = {
  columns: HOLIDAY_IMPORT_COLUMNS,
  validateRow: validateHolidayRow,
  validateAll: (rows) => (rows.length === 0 ? Promise.resolve([]) : validateHolidays(rows)),
  summarise: (rows) => ({ holidays: rows.length }),
};

export const previewHolidayImport = (buffer: Buffer, fileName: string): Promise<ImportPreview<HolidayRow>> =>
  runPreview(buffer, fileName, holidaySpec);

export const commitHolidayImport = (buffer: Buffer, fileName: string, actor: Actor) =>
  runCommit(buffer, fileName, holidaySpec, (rows) =>
    prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const h = await tx.holiday.create({ data: { name: r.name, type: r.type, date: toDate(r.date) } });
        await writeAudit(tx, { entity: 'HOLIDAY', entityId: h.id, action: 'IMPORT', changedBy: actor.sub, after: { name: r.name, date: r.date, type: r.type } });
      }
      return { created: rows.length };
    }),
  );

// ── Shifts ──────────────────────────────────────────────────────────────────

export const SHIFT_IMPORT_COLUMNS: ColumnSpec[] = [
  { header: 'name', required: true, uniqueInFile: true, caseInsensitive: true, type: 'text', maxLength: 80, description: 'A new shift name.', example: 'Ramadan' },
  { header: 'startTime', required: true, type: 'time', description: 'HH:mm, 24-hour.', example: '09:00' },
  { header: 'endTime', required: true, type: 'time', description: 'HH:mm, 24-hour.', example: '18:00' },
  { header: 'breakMinutes', required: false, type: 'integer', description: 'Minutes of break inside the span. Blank means 60.', example: '60' },
  { header: 'graceMinutes', required: false, type: 'integer', description: 'Minutes after the start before a punch is late. Blank means 15.', example: '15' },
  { header: 'weeklyOffDays', required: false, type: 'list', description: 'Off days, 0=Sunday to 6=Saturday, comma separated.', example: '5,6' },
  { header: 'effectiveFrom', required: false, type: 'date', description: 'First day of a dated override (YYYY-MM-DD). Leave both dates blank for a standing shift.', example: '2026-03-01' },
  { header: 'effectiveTo', required: false, type: 'date', description: 'Last day of a dated override.', example: '2026-03-30' },
];

export const shiftImportSampleRows = (): SampleRow[] => [
  { name: 'Standard', startTime: '09:00', endTime: '18:00', breakMinutes: '60', graceMinutes: '15', weeklyOffDays: '5', effectiveFrom: '', effectiveTo: '' },
  { name: 'Ramadan', startTime: '09:00', endTime: '16:00', breakMinutes: '30', graceMinutes: '15', weeklyOffDays: '5', effectiveFrom: '2026-03-01', effectiveTo: '2026-03-30' },
];

interface ShiftRow {
  rowNumber: number;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  weeklyOffDays: number[];
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

function validateShiftRow(row: ParsedRow): { ok: true; value: ShiftRow } | { ok: false; issues: RowIssue[] } {
  const number = (header: string, fallback: number) => {
    const raw = cellText(row.values, header);
    return raw === '' ? fallback : (parseWholeNumber(raw) ?? Number.NaN);
  };
  const days = cellText(row.values, 'weeklyOffDays')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((d) => parseWholeNumber(d) ?? Number.NaN);
  const parsed = shiftInputSchema.safeParse({
    name: cellText(row.values, 'name'),
    startTime: cellText(row.values, 'startTime'),
    endTime: cellText(row.values, 'endTime'),
    breakMinutes: number('breakMinutes', 60),
    graceMinutes: number('graceMinutes', 15),
    weeklyOffDays: days,
    effectiveFrom: cellText(row.values, 'effectiveFrom') || null,
    effectiveTo: cellText(row.values, 'effectiveTo') || null,
  });
  if (!parsed.success) return { ok: false, issues: zodIssues(row.rowNumber, parsed.error) };
  const d = parsed.data;
  return { ok: true, value: { rowNumber: row.rowNumber, ...d, effectiveFrom: d.effectiveFrom ?? null, effectiveTo: d.effectiveTo ?? null } };
}

// Names that exist already, and dated windows that overlap a stored override or each other.
async function validateShifts(rows: ShiftRow[]): Promise<RowIssue[]> {
  const issues: RowIssue[] = [];
  const stored = await prisma.shift.findMany({ select: { name: true, effectiveFrom: true, effectiveTo: true } });
  const names = new Set(stored.map((s) => s.name.toLowerCase()));
  const windows = stored
    .filter((s) => s.effectiveFrom && s.effectiveTo)
    .map((s) => ({ name: s.name, from: s.effectiveFrom!.toISOString().slice(0, 10), to: s.effectiveTo!.toISOString().slice(0, 10) }));
  for (const r of rows) {
    if (names.has(r.name.toLowerCase())) issues.push({ rowNumber: r.rowNumber, column: 'name', message: `"${r.name}" is already a shift.` });
    if (r.effectiveFrom && r.effectiveTo) {
      const clash = windows.find((w) => w.from <= r.effectiveTo! && w.to >= r.effectiveFrom!);
      if (clash) issues.push({ rowNumber: r.rowNumber, column: 'effectiveFrom', message: `Those dates overlap the dated shift "${clash.name}".` });
      windows.push({ name: r.name, from: r.effectiveFrom, to: r.effectiveTo });
    }
  }
  return issues;
}

const shiftSpec: ImportSpec<ShiftRow> = {
  columns: SHIFT_IMPORT_COLUMNS,
  validateRow: validateShiftRow,
  validateAll: (rows) => (rows.length === 0 ? Promise.resolve([]) : validateShifts(rows)),
  summarise: (rows) => ({ shifts: rows.length }),
};

export const previewShiftImport = (buffer: Buffer, fileName: string): Promise<ImportPreview<ShiftRow>> =>
  runPreview(buffer, fileName, shiftSpec);

export const commitShiftImport = (buffer: Buffer, fileName: string, actor: Actor) =>
  runCommit(buffer, fileName, shiftSpec, (rows) =>
    prisma.$transaction(async (tx) => {
      for (const r of rows) {
        const s = await tx.shift.create({
          data: {
            name: r.name,
            startTime: r.startTime,
            endTime: r.endTime,
            breakMinutes: r.breakMinutes,
            graceMinutes: r.graceMinutes,
            weeklyOffDays: r.weeklyOffDays,
            effectiveFrom: r.effectiveFrom ? toDate(r.effectiveFrom) : null,
            effectiveTo: r.effectiveTo ? toDate(r.effectiveTo) : null,
          },
        });
        await writeAudit(tx, { entity: 'SHIFT', entityId: s.id, action: 'IMPORT', changedBy: actor.sub, after: { name: r.name } });
      }
      return { created: rows.length };
    }),
  );

// ── Exports ─────────────────────────────────────────────────────────────────

export async function exportHolidays(req: Request, res: Response): Promise<void> {
  const format = parseExportFormat(req.query['format']);
  const year = Number(req.query['year']);
  const rows = await listHolidays(Number.isInteger(year) && year > 1900 ? { year } : {});
  const spec: ExportSpec = {
    title: 'Holidays',
    columns: [
      { header: 'date', type: 'date' },
      { header: 'name', type: 'text' },
      { header: 'type', type: 'text' },
    ],
    rows: rows.map((h) => [h.date, h.name, h.type]),
  };
  await sendExport({ res, spec, format, baseName: 'holidays', actor: req.user!, list: 'HOLIDAYS' });
}

export async function exportShifts(req: Request, res: Response): Promise<void> {
  const format = parseExportFormat(req.query['format']);
  const rows = await listShifts();
  const spec: ExportSpec = {
    title: 'Shifts',
    columns: [
      { header: 'name', type: 'text' },
      { header: 'startTime', type: 'text' },
      { header: 'endTime', type: 'text' },
      { header: 'breakMinutes', type: 'integer' },
      { header: 'graceMinutes', type: 'integer' },
      { header: 'weeklyOffDays', type: 'text' },
      { header: 'effectiveFrom', type: 'date' },
      { header: 'effectiveTo', type: 'date' },
      { header: 'employees', type: 'integer' },
    ],
    rows: rows.map((s) => [s.name, s.startTime, s.endTime, s.breakMinutes, s.graceMinutes, s.weeklyOffDays.join(','), s.effectiveFrom, s.effectiveTo, s.employeeCount]),
  };
  await sendExport({ res, spec, format, baseName: 'shifts', actor: req.user!, list: 'SHIFTS' });
}
