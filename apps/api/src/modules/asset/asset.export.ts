import type { Request, Response, NextFunction } from 'express';
import { listAssetsQuery, type ListAssetsQuery } from '@erp/contracts/asset';
import { parseExportFormat, sendExport, type ExportSpec } from '@erp/export';
import type { Viewer } from '../employee/employee.access.js';
import { listAssets } from './asset.service.js';

function filterNote(filters: ListAssetsQuery): string | undefined {
  const parts: string[] = [];
  if (filters.status) parts.push(`Status: ${filters.status}`);
  if (filters.categoryId) parts.push('One category only');
  if (filters.departmentId) parts.push('One department only');
  if (filters.q) parts.push(`Search: "${filters.q}"`);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Cost and vendor are blank for a viewer who cannot see them: `listAssets` leaves the fields out. */
export async function buildAssetExportSpec(
  viewer: Viewer,
  filters: ListAssetsQuery,
): Promise<ExportSpec> {
  const assets = await listAssets(viewer, filters);
  return {
    title: 'Asset register',
    filterNote: filterNote(filters),
    columns: [
      { header: 'assetTag', type: 'text' },
      { header: 'categoryCode', type: 'text' },
      { header: 'name', type: 'text' },
      { header: 'serialNumber', type: 'text' },
      { header: 'model', type: 'text' },
      { header: 'purchaseCost', type: 'decimal' },
      { header: 'currency', type: 'text' },
      { header: 'vendor', type: 'text' },
      { header: 'warrantyExpiry', type: 'date' },
      { header: 'location', type: 'text' },
      { header: 'status', type: 'text' },
      { header: 'assignedToEmployeeCode', type: 'text' },
      { header: 'assignedAt', type: 'date' },
      { header: 'holder', type: 'text' },
    ],
    rows: assets.map((a) => [
      a.assetTag,
      a.category.code,
      a.name,
      a.serialNumber,
      a.model,
      a.purchaseCost ?? null,
      a.currency,
      a.vendor ?? null,
      a.warrantyExpiry,
      a.location,
      a.status,
      a.heldBy?.employeeCode ?? null,
      a.heldBy?.assignedAt ?? null,
      a.heldBy?.fullName ?? null,
    ]),
  };
}

export async function exportAssetsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const format = parseExportFormat(req.query['format']);
    const filters = listAssetsQuery.parse(req.query);
    await sendExport({
      res,
      spec: await buildAssetExportSpec(req.user!, filters),
      format,
      baseName: 'assets',
      actor: req.user!,
      list: 'ASSETS',
      filter: filters,
    });
  } catch (err) {
    next(err);
  }
}
