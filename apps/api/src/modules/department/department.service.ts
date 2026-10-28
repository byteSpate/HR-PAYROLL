import { departmentInputSchema, type DepartmentView } from '@erp/contracts/department';
import { prisma, type Db, type Tx } from '@erp/db';
import { writeAudit } from '@erp/audit';
import { AppError } from '@erp/utils';

const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';

const duplicate = () => new AppError(409, 'A department with this name already exists');

// The column is unique as typed; "Sales" and "sales" are still one department to a person.
async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.department.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw duplicate();
}

const employeeCount = (db: Db, departmentId: string) => db.employee.count({ where: { departmentId } });

async function toView(db: Db, d: { id: string; name: string }): Promise<DepartmentView> {
  return { id: d.id, name: d.name, employeeCount: await employeeCount(db, d.id) };
}

/** Exported for modules that depend on department (employee validates its departmentId). */
export async function departmentExists(db: Db, id: string): Promise<boolean> {
  return (await db.department.count({ where: { id } })) > 0;
}

export async function listDepartments(): Promise<DepartmentView[]> {
  const rows = await prisma.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
  return Promise.all(rows.map((d) => toView(prisma, d)));
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isUniqueViolation(err)) throw duplicate();
    throw err;
  }
}

export function createDepartment(body: unknown, actorId: string): Promise<DepartmentView> {
  const { name } = departmentInputSchema.parse(body);
  return guarded(() =>
    prisma.$transaction(async (tx) => {
      await assertNameFree(tx, name);
      const d = await tx.department.create({ data: { name } });
      await writeAudit(tx, { entity: 'DEPARTMENT', entityId: d.id, action: 'CREATE', changedBy: actorId, after: { name } });
      return toView(tx, d);
    }),
  );
}

export function renameDepartment(id: string, body: unknown, actorId: string): Promise<DepartmentView> {
  const { name } = departmentInputSchema.parse(body);
  return guarded(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.department.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'Department not found');
      await assertNameFree(tx, name, id);
      const d = await tx.department.update({ where: { id }, data: { name } });
      if (existing.name !== name) {
        await writeAudit(tx, {
          entity: 'DEPARTMENT',
          entityId: id,
          action: 'UPDATE',
          changedBy: actorId,
          before: { name: existing.name },
          after: { name },
        });
      }
      return toView(tx, d);
    }),
  );
}

export async function deleteDepartment(id: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.department.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Department not found');
    if ((await employeeCount(tx, id)) > 0) throw new AppError(409, 'Department has employees');
    await tx.department.delete({ where: { id } });
    await writeAudit(tx, { entity: 'DEPARTMENT', entityId: id, action: 'DELETE', changedBy: actorId, before: { name: existing.name } });
  });
}
