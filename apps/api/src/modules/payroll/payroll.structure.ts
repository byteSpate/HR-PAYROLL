import type { SalaryStructureBody } from '@erp/contracts/payroll';
import { writeAudit } from '@erp/audit';
import { dec, prisma, toMoneyString, type Prisma } from '@erp/db';
import { AppError } from '@erp/utils';

function isUniqueViolation(err: unknown): boolean {
  return (err as Prisma.PrismaClientKnownRequestError)?.code === 'P2002';
}

type StructureWithComponents = Prisma.SalaryStructureGetPayload<{ include: { components: true } }>;

function serializeStructure(structure: StructureWithComponents) {
  return {
    name: structure.name,
    currency: structure.currency,
    basic: toMoneyString(structure.basic),
    isActive: structure.isActive,
    components: structure.components.map((c) => ({
      code: c.code,
      label: c.label,
      kind: c.kind,
      calc: c.calc,
      value: c.value.toFixed(2),
      sortOrder: c.sortOrder,
      countsAsWages: c.countsAsWages,
    })),
  };
}

function structureConflict(name: string): AppError {
  return new AppError(409, `A salary structure named "${name}" already exists`);
}

const toComponentCreateInput = (c: SalaryStructureBody['components'][number]) => ({
  code: c.code,
  label: c.label,
  kind: c.kind,
  calc: c.calc,
  value: dec(c.value),
  sortOrder: c.sortOrder,
  countsAsWages: c.countsAsWages,
});

/**
 * Every structure, with how many people are on it.
 *
 * The count is what makes the delete control honest. `deleteSalaryStructure`
 * refuses a structure in use, so without it the only way to learn that is to
 * press Delete and read the refusal — a button whose whole purpose is to be
 * pressed and then not work.
 *
 * Flattened out of Prisma's `_count` here rather than in the client: `_count`
 * is an ORM artefact, and a response shape should not leak which ORM produced
 * it.
 */
export async function listSalaryStructures() {
  const rows = await prisma.salaryStructure.findMany({
    include: {
      components: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      _count: { select: { employees: true } },
    },
    orderBy: { name: 'asc' },
  });

  return rows.map(({ _count, ...structure }) => ({
    ...structure,
    employeeCount: _count.employees,
  }));
}

export async function createSalaryStructure(actorUserId: string, body: SalaryStructureBody) {
  try {
    return await prisma.$transaction(async (tx) => {
      const structure = await tx.salaryStructure.create({
        data: {
          name: body.name,
          currency: body.currency,
          basic: dec(body.basic),
          isActive: body.isActive,
          components: { create: body.components.map(toComponentCreateInput) },
        },
        include: { components: true },
      });
      await writeAudit(tx, {
        entity: 'SALARY_STRUCTURE',
        entityId: structure.id,
        action: 'CREATE',
        changedBy: actorUserId,
        after: serializeStructure(structure),
      });
      return structure;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw structureConflict(body.name);
    throw err;
  }
}

export async function updateSalaryStructure(
  id: string,
  actorUserId: string,
  body: SalaryStructureBody,
) {
  const existing = await prisma.salaryStructure.findUnique({
    where: { id },
    include: { components: true },
  });
  if (!existing) throw new AppError(404, 'Salary structure not found');

  // Immutable after creation — changing it silently re-denominates every
  // figure already resolved against this structure.
  if (body.currency !== existing.currency) {
    throw new AppError(
      409,
      "Cannot change a salary structure's currency. Every FIXED component and every payslip that used it is denominated in the original currency — move affected employees to a different structure instead.",
    );
  }

  if (body.isActive === false) {
    const assigned = await prisma.employee.count({ where: { salaryStructureId: id } });
    if (assigned > 0) {
      throw new AppError(
        409,
        `${assigned} employee(s) are still assigned to this structure. Reassign them before retiring it.`,
      );
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // A wholesale replace, not a diff: nothing else in the schema holds a
      // foreign key to SalaryComponent, so delete-then-recreate cannot orphan
      // anything, and it is simpler than reconciling adds/edits/removals by
      // code.
      await tx.salaryComponent.deleteMany({ where: { salaryStructureId: id } });
      const structure = await tx.salaryStructure.update({
        where: { id },
        data: {
          name: body.name,
          basic: dec(body.basic),
          isActive: body.isActive,
          components: { create: body.components.map(toComponentCreateInput) },
        },
        include: { components: true },
      });
      await writeAudit(tx, {
        entity: 'SALARY_STRUCTURE',
        entityId: id,
        action: 'UPDATE',
        changedBy: actorUserId,
        before: serializeStructure(existing),
        after: serializeStructure(structure),
      });
      return structure;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw structureConflict(body.name);
    throw err;
  }
}

/**
 * Deletes a salary structure outright.
 *
 * Safe for history, and that is not an accident: a payslip is a frozen
 * snapshot holding its own basic, its own lines and its own totals — nothing
 * in the schema points a payslip at a `SalaryStructure`. So a June payslip
 * stays fully explicable after the structure it was computed from is gone.
 * The only rows that reference one are `SalaryComponent` (cascades) and
 * `Employee` (guarded below).
 *
 * The guard is the assignment count, not payslip usage. Prisma's default for
 * an optional relation is `SetNull`, so deleting a structure with people on
 * it would silently un-assign them and surface a month later as preflight
 * blocker 3. Refusing is the only honest option.
 */
export async function deleteSalaryStructure(id: string, actorUserId: string) {
  const existing = await prisma.salaryStructure.findUnique({
    where: { id },
    include: { components: true },
  });
  if (!existing) throw new AppError(404, 'Salary structure not found');

  const assigned = await prisma.employee.count({ where: { salaryStructureId: id } });
  if (assigned > 0) {
    throw new AppError(
      409,
      `${assigned} employee(s) are still on this structure. Move them to another one before deleting it.`,
      undefined,
      { assigned },
    );
  }

  return prisma.$transaction(async (tx) => {
    // Explicit rather than leaning on the cascade: the delete and its audit
    // row belong in one transaction, and being able to read the components
    // back out of `before` is the point of writing it.
    await tx.salaryComponent.deleteMany({ where: { salaryStructureId: id } });
    await tx.salaryStructure.delete({ where: { id } });
    await writeAudit(tx, {
      entity: 'SALARY_STRUCTURE',
      entityId: id,
      action: 'DELETE',
      changedBy: actorUserId,
      // The whole structure, so a deleted band is still reconstructable from
      // the log — an audit row naming only an id explains nothing.
      before: serializeStructure(existing),
    });
    return { id };
  });
}
