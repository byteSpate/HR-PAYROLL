import { idChangeDecisionSchema, idChangeRequestSchema } from '@erp/contracts/employee';
import { writeAudit } from '@erp/audit';
import { prisma, type Prisma } from '@erp/db';
import { emit } from '@erp/events';
import { AppError } from '@erp/utils';
import { scopeFor } from '@erp/auth';
import { loadActor } from '../users/actor.js';
import { reaches, type Viewer } from './employee.access.js';
import { viewerEmployeeOf } from './employee.service.js';

// Ported from HR-MNG-V1 employee.changerequest.ts. The national ID is not self-editable: an
// employee asks and HR decides, so a hijacked login cannot quietly change identity documents.

export interface ChangeRequestView {
  id: string;
  employee: { id: string; fullName: string; employeeCode: string };
  oldValue: string | null;
  newValue: string;
  status: string;
  createdAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
}

const INCLUDE = { employee: { select: { id: true, fullName: true, employeeCode: true, departmentId: true, userId: true } } } as const;

type Row = Prisma.EmployeeChangeRequestGetPayload<{ include: typeof INCLUDE }>;

const toView = (r: Row): ChangeRequestView => ({
  id: r.id,
  employee: { id: r.employee.id, fullName: r.employee.fullName, employeeCode: r.employee.employeeCode },
  oldValue: r.oldValue,
  newValue: r.newValue,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  decidedAt: r.decidedAt?.toISOString() ?? null,
  decisionNote: r.decisionNote,
});

export async function requestNationalIdChange(viewer: Viewer, input: unknown): Promise<ChangeRequestView> {
  const { newValue } = idChangeRequestSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const me = await tx.employee.findUnique({ where: { userId: viewer.sub } });
    if (!me) throw new AppError(404, 'No employee profile is linked to this account');
    const pending = await tx.employeeChangeRequest.count({
      where: { employeeId: me.id, field: 'NATIONAL_ID', status: 'PENDING' },
    });
    if (pending > 0) throw new AppError(409, 'You already have a pending national ID change');
    const row = await tx.employeeChangeRequest.create({
      data: { employeeId: me.id, field: 'NATIONAL_ID', oldValue: me.nationalId, newValue },
      include: INCLUDE,
    });
    await emit(tx, 'employee.national_id_change_requested', { employeeId: me.id, requestId: row.id });
    return toView(row);
  });
}

export async function cancelNationalIdChange(viewer: Viewer, id: string): Promise<ChangeRequestView> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.employeeChangeRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppError(404, 'Request not found');
    if (row.employee.userId !== viewer.sub) throw new AppError(403, 'Only the employee who asked can cancel this request');
    if (row.status !== 'PENDING') throw new AppError(409, 'This request has already been decided or cancelled');
    return toView(
      await tx.employeeChangeRequest.update({ where: { id }, data: { status: 'CANCELLED' }, include: INCLUDE }),
    );
  });
}

export async function listNationalIdChanges(viewer: Viewer, status?: string): Promise<ChangeRequestView[]> {
  const scope = scopeFor(viewer, 'employee.id_request.decide');
  const me = await viewerEmployeeOf(prisma, viewer.sub);
  const where: Prisma.EmployeeChangeRequestWhereInput = {
    ...(status ? { status: status as Prisma.EmployeeChangeRequestWhereInput['status'] } : {}),
    ...(scope === 'all' ? {} : { employee: { departmentId: me?.departmentId ?? '-' } }),
  };
  const rows = await prisma.employeeChangeRequest.findMany({ where, include: INCLUDE, orderBy: { createdAt: 'desc' } });
  return rows.map(toView);
}

export async function decideNationalIdChange(viewer: Viewer, id: string, input: unknown): Promise<ChangeRequestView> {
  const { approve, note } = idChangeDecisionSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const actor = await loadActor(tx, viewer.sub);
    const row = await tx.employeeChangeRequest.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw new AppError(404, 'Request not found');
    if (row.employee.userId === viewer.sub) throw new AppError(403, 'You cannot decide your own request');
    const me = await viewerEmployeeOf(tx, viewer.sub);
    if (!reaches(actor, me, { userId: row.employee.userId, departmentId: row.employee.departmentId, reportingManagerId: null }, 'employee.id_request.decide')) {
      throw new AppError(403, 'Forbidden');
    }
    if (row.status !== 'PENDING') throw new AppError(409, 'This request has already been decided or cancelled');

    const updated = await tx.employeeChangeRequest.update({
      where: { id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', decidedBy: viewer.sub, decidedAt: new Date(), decisionNote: note ?? null },
      include: INCLUDE,
    });
    if (approve) await tx.employee.update({ where: { id: row.employeeId }, data: { nationalId: row.newValue } });
    await writeAudit(tx, {
      entity: 'EMPLOYEE',
      entityId: row.employeeId,
      action: approve ? 'APPROVE' : 'REJECT',
      changedBy: viewer.sub,
      // The national ID itself stays out of the audit log; only that it changed and who decided.
      after: { field: 'nationalId', requestId: id },
    });
    return toView(updated);
  });
}
