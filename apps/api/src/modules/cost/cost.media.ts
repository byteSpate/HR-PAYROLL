import { DEFAULT_URL_TTL_SECONDS, getStorage, requireStorage, type UploadFile } from '@erp/attachments';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import { attachmentView } from './cost.view.js';

// Receipts live in file storage; the database keeps only the storage id and every open goes through a short-lived signed URL.

export async function uploadReceipt(actorUserId: string, costId: string, file: UploadFile | undefined) {
  // The bill is checked before anything is stored, so no file is left that nothing points at.
  if (!(await prisma.operatingCost.findUnique({ where: { id: costId }, select: { id: true } }))) throw new AppError(404, 'Cost not found');
  if (!file) throw new AppError(400, 'Choose a file to upload');
  const stored = await requireStorage().upload(file, `hr/costs/${costId}`);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.costAttachment.create({ data: { costId, publicId: stored.publicId, fileName: stored.fileName, bytes: stored.bytes, format: stored.format, uploadedBy: actorUserId } });
      await writeAudit(tx, { entity: 'COST', entityId: costId, action: 'CREATE', changedBy: actorUserId, after: { fileName: stored.fileName } });
      return attachmentView(row);
    });
  } catch (err) {
    await getStorage()?.remove(stored.publicId);
    throw err;
  }
}

export async function listReceipts(costId: string) {
  return (await prisma.costAttachment.findMany({ where: { costId }, orderBy: { uploadedAt: 'desc' } })).map(attachmentView);
}

export async function receiptUrl(receiptId: string) {
  const row = await prisma.costAttachment.findUnique({ where: { id: receiptId } });
  if (!row) throw new AppError(404, 'Receipt not found');
  const url = requireStorage().signedUrl(row.publicId, { format: row.format, expiresInSeconds: DEFAULT_URL_TTL_SECONDS });
  return { url, expiresAt: new Date(Date.now() + DEFAULT_URL_TTL_SECONDS * 1000).toISOString() };
}

export async function deleteReceipt(actorUserId: string, receiptId: string): Promise<void> {
  const row = await prisma.costAttachment.findUnique({ where: { id: receiptId } });
  if (!row) throw new AppError(404, 'Receipt not found');
  await prisma.$transaction(async (tx) => {
    await tx.costAttachment.delete({ where: { id: receiptId } });
    await writeAudit(tx, { entity: 'COST', entityId: row.costId, action: 'DELETE', changedBy: actorUserId, before: { fileName: row.fileName } });
  });
  await getStorage()?.remove(row.publicId).catch(() => undefined);
}
