import { z } from 'zod';
import { documentTypes, type EmployeeView } from '@erp/contracts/employee';
import { getStorage, packAvatar, publicIdOfAvatar, requireStorage, type UploadFile } from '@erp/attachments';
import { writeAudit } from '@erp/audit';
import { prisma, type Db } from '@erp/db';
import { AppError } from '@erp/utils';
import { reaches, type Viewer } from './employee.access.js';
import { getEmployee, viewerEmployeeOf } from './employee.service.js';

// Ported from HR-MNG-V1 employee.media.ts. Files live in storage as authenticated assets; the
// database keeps only the storage id, and every download goes through a short-lived signed URL.

export interface DocumentItem {
  id: string;
  type: string;
  fileName: string;
  bytes: number;
  format: string;
  uploadedAt: string;
}

const typeSchema = z.object({ type: z.enum(documentTypes) });

async function subjectOf(db: Db, id: string) {
  const e = await db.employee.findUnique({ where: { id }, select: { id: true, userId: true, departmentId: true, profilePicture: true } });
  if (!e) throw new AppError(404, 'Employee not found');
  return { ...e, reportingManagerId: null };
}

async function assertCanSee(viewer: Viewer, id: string) {
  const subject = await subjectOf(prisma, id);
  if (subject.userId === viewer.sub) return subject;
  const me = await viewerEmployeeOf(prisma, viewer.sub);
  if (reaches(viewer, me, subject, 'employee.read') || reaches(viewer, me, subject, 'employee.documents.manage')) return subject;
  throw new AppError(403, 'Forbidden');
}

async function assertCanManage(viewer: Viewer, id: string) {
  const subject = await subjectOf(prisma, id);
  if (!reaches(viewer, await viewerEmployeeOf(prisma, viewer.sub), subject, 'employee.documents.manage')) {
    throw new AppError(403, 'Forbidden', 'employee.documents.manage');
  }
  return subject;
}

const toItem = (d: { id: string; type: string; fileName: string; bytes: number; format: string; uploadedAt: Date }): DocumentItem => ({
  id: d.id,
  type: d.type,
  fileName: d.fileName,
  bytes: d.bytes,
  format: d.format,
  uploadedAt: d.uploadedAt.toISOString(),
});

export async function listDocuments(viewer: Viewer, id: string): Promise<DocumentItem[]> {
  await assertCanSee(viewer, id);
  const docs = await prisma.document.findMany({ where: { employeeId: id }, orderBy: { uploadedAt: 'desc' } });
  return docs.map(toItem);
}

export async function uploadDocument(viewer: Viewer, id: string, body: unknown, file: UploadFile | undefined): Promise<DocumentItem> {
  await assertCanManage(viewer, id);
  const { type } = typeSchema.parse(body);
  if (!file) throw new AppError(400, 'Choose a file to upload');
  const stored = await requireStorage().upload(file, `hr/documents/${id}`);
  const doc = await prisma.$transaction(async (tx) => {
    const d = await tx.document.create({
      data: { employeeId: id, type, publicId: stored.publicId, fileName: stored.fileName, bytes: stored.bytes, format: stored.format, uploadedBy: viewer.sub },
    });
    await writeAudit(tx, { entity: 'EMPLOYEE_DOCUMENT', entityId: id, action: 'CREATE', changedBy: viewer.sub, after: { documentId: d.id, type, fileName: d.fileName } });
    return d;
  });
  return toItem(doc);
}

export async function documentUrl(viewer: Viewer, id: string, docId: string): Promise<{ url: string }> {
  await assertCanSee(viewer, id);
  const doc = await prisma.document.findFirst({ where: { id: docId, employeeId: id } });
  if (!doc) throw new AppError(404, 'Document not found');
  return { url: requireStorage().signedUrl(doc.publicId, { format: doc.format }) };
}

export async function deleteDocument(viewer: Viewer, id: string, docId: string): Promise<void> {
  await assertCanManage(viewer, id);
  const doc = await prisma.document.findFirst({ where: { id: docId, employeeId: id } });
  if (!doc) throw new AppError(404, 'Document not found');
  // Storage first: an orphaned row pointing at nothing is worse than an orphaned file nobody can reach.
  await getStorage()?.remove(doc.publicId);
  await prisma.$transaction(async (tx) => {
    await tx.document.delete({ where: { id: docId } });
    await writeAudit(tx, { entity: 'EMPLOYEE_DOCUMENT', entityId: id, action: 'DELETE', changedBy: viewer.sub, before: { documentId: docId, fileName: doc.fileName } });
  });
}

async function assertCanEditAvatar(viewer: Viewer, id: string) {
  const subject = await subjectOf(prisma, id);
  if (subject.userId === viewer.sub) return subject;
  if (reaches(viewer, await viewerEmployeeOf(prisma, viewer.sub), subject, 'employee.update')) return subject;
  throw new AppError(403, 'Forbidden');
}

export { packAvatar };
const publicIdOf = publicIdOfAvatar;

export async function setAvatar(viewer: Viewer, id: string, file: UploadFile | undefined): Promise<EmployeeView> {
  const subject = await assertCanEditAvatar(viewer, id);
  if (!file) throw new AppError(400, 'Choose an image to upload');
  const storage = requireStorage();
  const stored = await storage.upload(file, `hr/avatars/${id}`);
  await prisma.employee.update({ where: { id }, data: { profilePicture: packAvatar(stored.publicId, stored.version) } });
  if (subject.profilePicture) await storage.remove(publicIdOf(subject.profilePicture));
  return getEmployee(viewer, id);
}

export async function clearAvatar(viewer: Viewer, id: string): Promise<EmployeeView> {
  const subject = await assertCanEditAvatar(viewer, id);
  if (subject.profilePicture) {
    await prisma.employee.update({ where: { id }, data: { profilePicture: null } });
    await getStorage()?.remove(publicIdOf(subject.profilePicture));
  }
  return getEmployee(viewer, id);
}
