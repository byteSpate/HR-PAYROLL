import { Router } from 'express';
import { uploadSingle } from '@erp/attachments';
import { commitHandler, guideHandler, previewHandler, templateHandler } from '@erp/export';
import { requireAuth } from '../../middleware/require-auth.js';
import { requirePermission } from '../../middleware/require-permission.js';
import {
  HOLIDAY_IMPORT_COLUMNS,
  SHIFT_IMPORT_COLUMNS,
  commitHolidayImport,
  commitShiftImport,
  exportHolidays,
  exportShifts,
  holidayImportSampleRows,
  previewHolidayImport,
  previewShiftImport,
  shiftImportSampleRows,
} from './config.import.js';
import * as holidays from './holiday.service.js';
import * as shifts from './shift.service.js';

export const attendanceConfigRouter = Router();

attendanceConfigRouter.use(requireAuth);

// Browsers label CSV inconsistently, so both common types are accepted alongside xlsx.
const spreadsheet = uploadSingle('file', {
  maxBytes: 15 * 1024 * 1024,
  mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'application/vnd.ms-excel'],
});

const canConfig = requirePermission('attendance.config');
// The employee form needs the shift list too, so those who hire can read it without configuring shifts.
const canListShifts = requirePermission(['attendance.config', 'employee.create']);

// ── Shifts ──
attendanceConfigRouter.get('/shifts/import/guide', canConfig, guideHandler(SHIFT_IMPORT_COLUMNS));
attendanceConfigRouter.get(
  '/shifts/import/template',
  canConfig,
  templateHandler({ columns: SHIFT_IMPORT_COLUMNS, sampleRows: shiftImportSampleRows, baseName: 'shifts' }),
);
attendanceConfigRouter.post('/shifts/import/preview', canConfig, spreadsheet, previewHandler(previewShiftImport));
attendanceConfigRouter.post('/shifts/import/commit', canConfig, spreadsheet, commitHandler(commitShiftImport));
attendanceConfigRouter.get('/shifts/export', canConfig, exportShifts);
attendanceConfigRouter.get('/shifts', canListShifts, async (_req, res) => {
  res.json(await shifts.listShifts());
});
attendanceConfigRouter.post('/shifts', canConfig, async (req, res) => {
  res.status(201).json(await shifts.createShift(req.body, req.user!.sub));
});
attendanceConfigRouter.patch('/shifts/:id', canConfig, async (req, res) => {
  res.json(await shifts.updateShift(String(req.params['id']), req.body, req.user!.sub));
});
attendanceConfigRouter.delete('/shifts/:id', canConfig, async (req, res) => {
  await shifts.deleteShift(String(req.params['id']), req.user!.sub);
  res.status(204).end();
});

// ── Holidays: readable by anyone signed in, because leave counts them ──
attendanceConfigRouter.get('/holidays/import/guide', canConfig, guideHandler(HOLIDAY_IMPORT_COLUMNS));
attendanceConfigRouter.get(
  '/holidays/import/template',
  canConfig,
  templateHandler({ columns: HOLIDAY_IMPORT_COLUMNS, sampleRows: holidayImportSampleRows, baseName: 'holidays' }),
);
attendanceConfigRouter.post('/holidays/import/preview', canConfig, spreadsheet, previewHandler(previewHolidayImport));
attendanceConfigRouter.post('/holidays/import/commit', canConfig, spreadsheet, commitHandler(commitHolidayImport));
attendanceConfigRouter.get('/holidays/export', canConfig, exportHolidays);
attendanceConfigRouter.get('/holidays', async (req, res) => {
  const year = Number(req.query['year']);
  res.json(await holidays.listHolidays(Number.isInteger(year) && year > 1900 ? { year } : {}));
});
attendanceConfigRouter.post('/holidays', canConfig, async (req, res) => {
  res.status(201).json(await holidays.createHoliday(req.body, req.user!.sub));
});
attendanceConfigRouter.patch('/holidays/:id', canConfig, async (req, res) => {
  res.json(await holidays.updateHoliday(String(req.params['id']), req.body, req.user!.sub));
});
attendanceConfigRouter.delete('/holidays/:id', canConfig, async (req, res) => {
  res.json(await holidays.deleteHoliday(String(req.params['id']), req.user!.sub));
});
