import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';

/** The employee record behind a login, for the many actions that belong to a person rather than to an account. */
export async function employeeOf(userId: string) {
  const employee = await prisma.employee.findUnique({ where: { userId } });
  if (!employee) throw new AppError(403, 'An employee record is required');
  return employee;
}
