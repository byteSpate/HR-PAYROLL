import type { ExpenseReceipt } from '@erp/contracts/expense';
import { getStorage, requireStorage, type UploadFile } from '@erp/attachments';
import { writeAudit } from '@erp/audit';
import { DEFAULT_URL_TTL_SECONDS } from '@erp/attachments';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from '../employee/employee.access.js';
import { employeeOf, getClaim } from './expense.service.js';

// Receipts live in file storage as authenticated assets; the database keeps only the storage id, and every
// open goes through a short-lived signed URL.

const toItem = (row: { id: string; fileName: string; bytes: number; format: string; uploadedAt: Date }): ExpenseReceipt => ({
  id: row.id,
  fileName: row.fileName,
  bytes: row.bytes,
  format: row.format,
  uploadedAt: row.uploadedAt.toISOString(),
});

/**
 * A claim whose receipts the viewer may read: their own, or one they reach through expense.read (a 404
 * otherwise, so existence is not confirmed). Opening a receipt is reading the claim, so it asks the same question.
 */
async function readable(viewer: Viewer, claimId: string): Promise<void> {
  await getClaim(viewer, claimId);
}

/**
 * A claim whose receipts the viewer may change: only the owner, and only while it is pending. Evidence
 * behind a decision somebody already made must not move underneath it, so a decided claim refuses everyone.
 */
async function writable(viewer: Viewer, claimId: string): Promise<void> {
  const self = await employeeOf(viewer.sub);
  const claim = await prisma.expenseClaim.findUnique({ where: { id: claimId }, select: { employeeId: true, status: true } });
  if (!claim || claim.employeeId !== self.id) throw new AppError(404, 'Expense claim not found');
  if (claim.status !== 'PENDING') throw new AppError(409, `This claim is already ${claim.status.toLowerCase()}, so its receipts can no longer be changed.`);
}

export async function uploadReceipt(viewer: Viewer, claimId: string, file: UploadFile | undefined): Promise<ExpenseReceipt> {
  // Validated before anything is stored: uploading first would leave a file nothing points at.
  await writable(viewer, claimId);
  if (!file) throw new AppError(400, 'Choose a file to upload');
  const stored = await requireStorage().upload(file, `hr/expenses/${claimId}`);
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await tx.expenseAttachment.create({ data: { claimId, publicId: stored.publicId, fileName: stored.fileName, bytes: stored.bytes, format: stored.format, uploadedBy: viewer.sub } });
      await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: claimId, action: 'CREATE', changedBy: viewer.sub, after: { receipt: stored.fileName } });
      return toItem(row);
    });
  } catch (err) {
    // The file exists already; a failed write must not leave it dangling.
    await getStorage()?.remove(stored.publicId);
    throw err;
  }
}

export async function listReceipts(viewer: Viewer, claimId: string): Promise<ExpenseReceipt[]> {
  await readable(viewer, claimId);
  const rows = await prisma.expenseAttachment.findMany({ where: { claimId }, orderBy: { uploadedAt: 'desc' } });
  return rows.map(toItem);
}

export async function receiptUrl(viewer: Viewer, receiptId: string): Promise<{ url: string; expiresAt: string }> {
  const receipt = await prisma.expenseAttachment.findUnique({ where: { id: receiptId } });
  if (!receipt) throw new AppError(404, 'Receipt not found');
  await readable(viewer, receipt.claimId);
  const url = requireStorage().signedUrl(receipt.publicId, { format: receipt.format, expiresInSeconds: DEFAULT_URL_TTL_SECONDS });
  return { url, expiresAt: new Date(Date.now() + DEFAULT_URL_TTL_SECONDS * 1000).toISOString() };
}

export async function deleteReceipt(viewer: Viewer, receiptId: string): Promise<void> {
  const receipt = await prisma.expenseAttachment.findUnique({ where: { id: receiptId } });
  if (!receipt) throw new AppError(404, 'Receipt not found');
  await writable(viewer, receipt.claimId);
  // The file first, outside the transaction: the other order can leave a file nothing points at, while this one
  // can at worst leave a row pointing at a removed file, which the URL endpoint surfaces as a clean 404.
  await getStorage()?.remove(receipt.publicId);
  await prisma.$transaction(async (tx) => {
    await tx.expenseAttachment.delete({ where: { id: receiptId } });
    await writeAudit(tx, { entity: 'EXPENSE_CLAIM', entityId: receipt.claimId, action: 'DELETE', changedBy: viewer.sub, before: { receipt: receipt.fileName } });
  });
}
