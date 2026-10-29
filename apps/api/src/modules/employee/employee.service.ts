import {
  BANK_FIELDS,
  createEmployeeSchema,
  updateEmployeeSchema,
  type EmployeeView,
  type UpdateEmployeeInput,
} from '@erp/contracts/employee';
import { avatarUrlFor } from '@erp/attachments';
import { can, scopeFor } from '@erp/auth';
import { diffFields, writeAudit } from '@erp/audit';
import { prisma, type Db, type Prisma, type Tx } from '@erp/db';
import { emit } from '@erp/events';
import { AppError } from '@erp/utils';
import { departmentExists } from '../department/department.service.js';
import { loadActor } from '../users/actor.js';
import { insertStandardUser } from '../users/users.service.js';
import { computeBlockers } from './employee.blockers.js';
import {
  EMPLOYEE_INCLUDE,
  projectEmployee,
  reaches,
  visibilityTier,
  writableFieldsFor,
  type EmployeeRecord,
  type ProjectionExtras,
  type Tier,
  type Viewer,
  type ViewerEmployee,
} from './employee.access.js';

const toDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

/** Exported for modules that link records to the signed-in user's employee. */
export async function employeeIdForUser(db: Db, userId: string): Promise<string | null> {
  return (await db.employee.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
}

export const viewerEmployeeOf = (db: Db, userId: string): Promise<ViewerEmployee | null> =>
  db.employee.findUnique({ where: { userId }, select: { id: true, departmentId: true } });

export { avatarUrlFor };

type Row = EmployeeRecord & { userId: string; departmentId: string; reportingManagerId: string | null };

export function viewFor(viewer: Viewer, viewerEmployee: ViewerEmployee | null, row: Row, tierOverride?: Tier, extras?: ProjectionExtras): EmployeeView {
  const tier = tierOverride ?? visibilityTier(viewer, viewerEmployee, row);
  const canUpdate = reaches(viewer, viewerEmployee, row, 'employee.update');
  return projectEmployee(row, tier, writableFieldsFor(tier, canUpdate), avatarUrlFor(row.profilePicture), extras);
}

/**
 * One person's full record: the projection plus what only a detail read loads. Documents and
 * blockers are for the owner and HR only, because a blocker names an operational gap in someone's file.
 */
async function detailFor(viewer: Viewer, viewerEmployee: ViewerEmployee | null, row: Row, tierOverride?: Tier): Promise<EmployeeView> {
  const tier = tierOverride ?? visibilityTier(viewer, viewerEmployee, row);
  if (tier !== 'SELF' && tier !== 'FULL') return viewFor(viewer, viewerEmployee, row, tier);
  const [documents, pending] = await Promise.all([
    prisma.document.findMany({ where: { employeeId: row.id }, orderBy: { uploadedAt: 'desc' } }),
    prisma.employeeChangeRequest.findFirst({ where: { employeeId: row.id, field: 'NATIONAL_ID', status: 'PENDING' } }),
  ]);
  return viewFor(viewer, viewerEmployee, row, tier, {
    documents: documents.map((d) => ({ id: d.id, type: d.type, fileName: d.fileName, bytes: d.bytes, format: d.format, uploadedAt: d.uploadedAt.toISOString() })),
    blockers: computeBlockers(row, documents.map((d) => d.type)),
    nationalIdChangeRequest: pending ? { id: pending.id, newValue: pending.newValue, requestedAt: pending.createdAt.toISOString() } : null,
  });
}

async function loadRow(db: Db, id: string): Promise<Row> {
  const row = await db.employee.findUnique({ where: { id }, include: EMPLOYEE_INCLUDE });
  if (!row) throw new AppError(404, 'Employee not found');
  return row;
}

// The next free EMP-0001 style code; a concurrent hire that takes it surfaces as a 409.
async function nextEmployeeCode(tx: Tx): Promise<string> {
  const last = await tx.employee.findFirst({
    where: { employeeCode: { startsWith: 'EMP-' } },
    orderBy: { employeeCode: 'desc' },
    select: { employeeCode: true },
  });
  const n = last ? Number(last.employeeCode.slice(4)) + 1 : 1;
  return `EMP-${String(Number.isFinite(n) ? n : 1).padStart(4, '0')}`;
}

/** Walks up from the proposed manager; reaching the employee means the line would loop. */
export async function assertNoReportingCycle(db: Db, employeeId: string, managerId: string): Promise<void> {
  const cycle = () => new AppError(409, 'Reporting line would form a cycle');
  if (managerId === employeeId) throw cycle();
  let current: string | null = managerId;
  for (let hops = 0; current !== null && hops < 10_000; hops += 1) {
    const row: { reportingManagerId: string | null } | null = await db.employee.findUnique({
      where: { id: current },
      select: { reportingManagerId: true },
    });
    if (!row) throw new AppError(400, 'Unknown reporting manager');
    if (row.reportingManagerId === employeeId) throw cycle();
    current = row.reportingManagerId;
  }
}

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

export async function createEmployee(input: unknown, viewer: Viewer) {
  const body = createEmployeeSchema.parse(input);
  try {
    const { employeeId, temporaryPassword, actor } = await prisma.$transaction(async (tx) => {
      const actor = await loadActor(tx, viewer.sub, 'employee.create');
      if (!(await departmentExists(tx, body.departmentId))) throw new AppError(400, 'Unknown department');
      if (body.reportingManagerId && !(await tx.employee.count({ where: { id: body.reportingManagerId } }))) {
        throw new AppError(400, 'Unknown reporting manager');
      }
      if (body.shiftId && !(await tx.shift.count({ where: { id: body.shiftId } }))) throw new AppError(400, 'Unknown shift');
      const { id: userId, temporaryPassword } = await insertStandardUser(
        tx,
        { email: body.email, displayName: body.fullName, roleId: body.roleId },
        actor,
      );
      const employee = await tx.employee.create({
        data: {
          userId,
          employeeCode: body.employeeCode ?? (await nextEmployeeCode(tx)),
          fullName: body.fullName,
          designation: body.designation,
          departmentId: body.departmentId,
          reportingManagerId: body.reportingManagerId ?? null,
          shiftId: body.shiftId ?? null,
          employmentType: body.employmentType,
          joiningDate: toDate(body.joiningDate),
        },
      });
      await writeAudit(tx, {
        entity: 'EMPLOYEE',
        entityId: employee.id,
        action: 'CREATE',
        changedBy: viewer.sub,
        after: { employeeCode: employee.employeeCode, fullName: body.fullName, departmentId: body.departmentId },
      });
      await emit(tx, 'employee.joined', {
        employeeId: employee.id,
        departmentId: body.departmentId,
        joiningDate: body.joiningDate,
      });
      return { employeeId: employee.id, temporaryPassword, actor };
    });
    const row = await loadRow(prisma, employeeId);
    return { employee: viewFor(actor, await viewerEmployeeOf(prisma, viewer.sub), row), temporaryPassword };
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, 'That employee code is already taken');
    throw err;
  }
}

export interface ListFilter {
  q?: string;
  departmentId?: string;
  status?: string;
}

function filterWhere(f: ListFilter): Prisma.EmployeeWhereInput {
  const q = f.q?.trim();
  return {
    ...(f.departmentId ? { departmentId: f.departmentId } : {}),
    ...(f.status ? { employmentStatus: f.status as Prisma.EmployeeWhereInput['employmentStatus'] } : {}),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: 'insensitive' } },
            { employeeCode: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
}

/** The records a viewer's read grant covers; Finance's bank access spans everyone. Null: none. */
export function scopeWhere(viewer: Viewer, viewerEmployee: ViewerEmployee | null): Prisma.EmployeeWhereInput | null {
  const scope = scopeFor(viewer, 'employee.read');
  if (scope === 'all' || can(viewer, 'employee.read.financial')) return {};
  if (scope === 'department' && viewerEmployee) return { departmentId: viewerEmployee.departmentId };
  return null;
}

export async function listEmployees(viewer: Viewer, f: ListFilter): Promise<EmployeeView[]> {
  const viewerEmployee = await viewerEmployeeOf(prisma, viewer.sub);
  const scope = scopeWhere(viewer, viewerEmployee);
  if (scope === null) throw new AppError(403, 'Forbidden');
  const rows = await prisma.employee.findMany({
    where: { AND: [scope, filterWhere(f)] },
    include: EMPLOYEE_INCLUDE,
    orderBy: { fullName: 'asc' },
  });
  return rows.map((r) => viewFor(viewer, viewerEmployee, r));
}

export async function getMyEmployee(viewer: Viewer): Promise<EmployeeView> {
  const row = await prisma.employee.findUnique({ where: { userId: viewer.sub }, include: EMPLOYEE_INCLUDE });
  if (!row) throw new AppError(404, 'No employee profile is linked to this account');
  return detailFor(viewer, row, row);
}

export async function directory(viewer: Viewer, f: ListFilter): Promise<EmployeeView[]> {
  const rows = await prisma.employee.findMany({
    where: { AND: [{ employmentStatus: { in: ['ACTIVE', 'ON_LEAVE'] } }, filterWhere({ q: f.q, departmentId: f.departmentId })] },
    include: EMPLOYEE_INCLUDE,
    orderBy: { fullName: 'asc' },
  });
  // Everyone sees everyone's work identity here, including their own row.
  return rows.map((r) => projectEmployee(r, 'COLLEAGUE', new Set(), avatarUrlFor(r.profilePicture)));
}

export async function getEmployee(viewer: Viewer, id: string): Promise<EmployeeView> {
  return detailFor(viewer, await viewerEmployeeOf(prisma, viewer.sub), await loadRow(prisma, id));
}

const DATE_FIELDS = new Set(['dateOfBirth', 'joiningDate']);
const BANK = new Set<string>(BANK_FIELDS);

export async function updateEmployee(viewer: Viewer, id: string, input: unknown): Promise<EmployeeView> {
  if (typeof input !== 'object' || input === null) throw new AppError(400, 'Invalid request body');
  await prisma.$transaction(async (tx) => {
    // Fresh grants: an edit right revoked minutes ago must stop working now, not at token expiry.
    const actor = await loadActor(tx, viewer.sub);
    const viewerEmployee = await viewerEmployeeOf(tx, viewer.sub);
    const row = await loadRow(tx, id);
    const tier = visibilityTier(actor, viewerEmployee, row);
    const writable = writableFieldsFor(tier, reaches(actor, viewerEmployee, row, 'employee.update'));
    // Checked before parsing so a forbidden field is named, not reported as an unknown key.
    for (const key of Object.keys(input)) {
      if (!writable.has(key)) throw new AppError(403, `Field not editable: ${key}`);
    }
    const body: UpdateEmployeeInput = updateEmployeeSchema.parse(input);

    if (body.departmentId && !(await departmentExists(tx, body.departmentId))) throw new AppError(400, 'Unknown department');
    if (body.reportingManagerId) await assertNoReportingCycle(tx, id, body.reportingManagerId);
    if (body.shiftId && !(await tx.shift.count({ where: { id: body.shiftId } }))) throw new AppError(400, 'Unknown shift');

    const data = Object.fromEntries(
      Object.entries(body).map(([k, v]) => [k, DATE_FIELDS.has(k) && typeof v === 'string' ? toDate(v) : v]),
    ) as Prisma.EmployeeUncheckedUpdateInput;
    const before = Object.fromEntries(Object.keys(body).map((k) => [k, (row as unknown as Record<string, unknown>)[k]]));
    const change = diffFields(before, data as Record<string, unknown>);
    if (!change) return;

    await tx.employee.update({ where: { id }, data });
    await writeAudit(tx, {
      entity: 'EMPLOYEE',
      entityId: id,
      action: 'UPDATE',
      changedBy: viewer.sub,
      before: JSON.parse(JSON.stringify(change.before)),
      after: JSON.parse(JSON.stringify(change.after)),
    });
    // Bank changes are the payroll-diversion route, so payroll and alerts get to see every one.
    if (Object.keys(change.after).some((k) => BANK.has(k))) {
      await emit(tx, 'employee.bank_changed', { employeeId: id, changedBy: viewer.sub });
    }
  });
  return getEmployee(viewer, id);
}
