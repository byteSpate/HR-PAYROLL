import { categoryBody, type ExpenseCategory } from '@erp/contracts/expense';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';

const isUniqueViolation = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
const taken = () => new AppError(409, 'A category with this code or name already exists');

export function listCategories(): Promise<ExpenseCategory[]> {
  return prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
}

export async function createCategory(actorId: string, input: unknown): Promise<ExpenseCategory> {
  const body = categoryBody.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const category = await tx.expenseCategory.create({ data: body });
      await writeAudit(tx, { entity: 'EXPENSE_CATEGORY', entityId: category.id, action: 'CREATE', changedBy: actorId, after: body });
      return category;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw taken();
    throw err;
  }
}

/** The code is the stable key claims are classified by, so only the name changes. */
export async function renameCategory(actorId: string, id: string, input: unknown): Promise<ExpenseCategory> {
  const { name } = categoryBody.pick({ name: true }).parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.expenseCategory.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'Category not found');
      const updated = await tx.expenseCategory.update({ where: { id }, data: { name } });
      await writeAudit(tx, { entity: 'EXPENSE_CATEGORY', entityId: id, action: 'UPDATE', changedBy: actorId, before: { code: existing.code, name: existing.name }, after: { code: updated.code, name: updated.name } });
      return updated;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw taken();
    throw err;
  }
}

export async function deleteCategory(actorId: string, id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.expenseCategory.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Category not found');
    const claims = await tx.expenseClaim.count({ where: { categoryId: id } });
    if (claims > 0) throw new AppError(409, `${existing.name} is used by ${claims} claim(s) and cannot be deleted.`);
    await tx.expenseCategory.delete({ where: { id } });
    await writeAudit(tx, { entity: 'EXPENSE_CATEGORY', entityId: id, action: 'DELETE', changedBy: actorId, before: { code: existing.code, name: existing.name } });
  });
}
