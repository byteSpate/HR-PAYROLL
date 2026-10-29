import type { AssetAttachmentKind } from '@erp/contracts/asset';
import {
  DEFAULT_URL_TTL_SECONDS,
  getStorage,
  requireStorage,
  type UploadFile,
} from '@erp/attachments';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { readableAssets } from './asset.access.js';
import { assertManageable } from './asset.service.js';
import { attachmentView } from './asset.view.js';

// An attachment carries exactly one of `assetId` / `assignmentId`: an asset-level file (photo, invoice, warranty)
// or a handover-level one (condition photos). The database enforces that with a CHECK; this module enforces the
// matching rule that the kind agrees with which column is set. Condition photos upload into the asset's folder
// even though the row belongs to the assignment, so every photograph of one laptop stays together. The parent is
// validated before anything is stored, so no file is left that nothing points at.

const ASSET_KINDS: AssetAttachmentKind[] = ['PHOTO', 'INVOICE', 'WARRANTY'];
const HANDOVER_KINDS: AssetAttachmentKind[] = ['CONDITION_OUT', 'CONDITION_IN'];

async function store(
  owner: { assetId: string; assignmentId?: string },
  kind: AssetAttachmentKind,
  file: UploadFile | undefined,
  viewer: Viewer,
  entity: 'ASSET' | 'ASSET_ASSIGNMENT',
) {
  if (!file) throw new AppError(400, 'Choose a file to upload');
  const stored = await requireStorage().upload(file, `hr/assets/${owner.assetId}`);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.assetAttachment.create({
        data: {
          assetId: owner.assignmentId ? null : owner.assetId,
          assignmentId: owner.assignmentId ?? null,
          kind,
          publicId: stored.publicId,
          fileName: stored.fileName,
          bytes: stored.bytes,
          format: stored.format,
          uploadedBy: viewer.sub,
        },
      });
      await writeAudit(tx, {
        entity,
        entityId: owner.assignmentId ?? owner.assetId,
        action: 'CREATE',
        changedBy: viewer.sub,
        after: { kind, fileName: stored.fileName },
      });
      return attachmentView(row);
    });
  } catch (err) {
    await getStorage()?.remove(stored.publicId);
    throw err;
  }
}

export async function uploadAssetAttachment(
  viewer: Viewer,
  assetId: string,
  kind: AssetAttachmentKind,
  file: UploadFile | undefined,
) {
  await assertManageable(viewer, assetId);
  if (!ASSET_KINDS.includes(kind))
    throw new AppError(400, `${kind} is a handover attachment and cannot be uploaded to an asset`);
  return store({ assetId }, kind, file, viewer, 'ASSET');
}

export async function uploadAssignmentAttachment(
  viewer: Viewer,
  assignmentId: string,
  kind: AssetAttachmentKind,
  file: UploadFile | undefined,
) {
  const assignment = await prisma.assetAssignment.findUnique({
    where: { id: assignmentId },
    select: { assetId: true },
  });
  if (!assignment) throw new AppError(404, 'Assignment not found');
  await assertManageable(viewer, assignment.assetId);
  if (!HANDOVER_KINDS.includes(kind))
    throw new AppError(400, `${kind} is an asset attachment and cannot be uploaded to a handover`);
  return store(
    { assetId: assignment.assetId, assignmentId },
    kind,
    file,
    viewer,
    'ASSET_ASSIGNMENT',
  );
}

/** The asset an attachment belongs to, whichever way round it hangs. */
async function owningAsset(attachmentId: string) {
  const row = await prisma.assetAttachment.findUnique({
    where: { id: attachmentId },
    include: { assignment: { select: { assetId: true } } },
  });
  if (!row) throw new AppError(404, 'Attachment not found');
  return { row, assetId: (row.assetId ?? row.assignment?.assetId)! };
}

export async function getAttachmentUrl(viewer: Viewer, attachmentId: string) {
  const { row, assetId } = await owningAsset(attachmentId);
  // Opening a file is reading the asset, so it asks the same question and answers 404 the same way.
  if (
    (await prisma.asset.count({
      where: { AND: [{ id: assetId }, await readableAssets(viewer)] },
    })) === 0
  )
    throw new AppError(404, 'Attachment not found');
  const url = requireStorage().signedUrl(row.publicId, {
    format: row.format,
    expiresInSeconds: DEFAULT_URL_TTL_SECONDS,
  });
  return { url, expiresAt: new Date(Date.now() + DEFAULT_URL_TTL_SECONDS * 1000).toISOString() };
}

export async function deleteAttachment(viewer: Viewer, attachmentId: string): Promise<void> {
  const { row, assetId } = await owningAsset(attachmentId);
  await assertManageable(viewer, assetId);
  await prisma.$transaction(async (tx) => {
    await tx.assetAttachment.delete({ where: { id: attachmentId } });
    await writeAudit(tx, {
      entity: row.assetId ? 'ASSET' : 'ASSET_ASSIGNMENT',
      entityId: (row.assetId ?? row.assignmentId)!,
      action: 'DELETE',
      changedBy: viewer.sub,
      before: { kind: row.kind, fileName: row.fileName },
    });
  });
  // After the row, so a failed delete keeps its file; one that cannot be removed is left unreferenced, which costs storage and never a record.
  await getStorage()
    ?.remove(row.publicId)
    .catch(() => undefined);
}
