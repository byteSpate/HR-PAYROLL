import { assignStructureBody } from '@erp/contracts/payroll';
import { writeAudit } from '@erp/audit';
import { prisma } from '@erp/db';
import { AppError } from '@erp/utils';
import type { Viewer } from './employee.access.js';
import { getEmployee } from './employee.service.js';

/** Puts a person on a salary structure, or takes them off one. Authoring structures is `payroll.config`; this is the HR half. */
export async function setSalaryStructure(viewer: Viewer, employeeId: string, input: unknown) {
  const body = assignStructureBody.parse(input);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId} FOR UPDATE`;
    const employee = await tx.employee.findUnique({
      where: { id: employeeId },
      include: { salaryStructure: true },
    });
    if (!employee) throw new AppError(404, 'Employee not found');

    let structure = null;
    if (body.salaryStructureId !== null) {
      structure = await tx.salaryStructure.findUnique({ where: { id: body.salaryStructureId } });
      if (!structure) throw new AppError(404, 'Salary structure not found');
      // An inactive structure is one that has been retired; assigning to it would pay a band no longer authorised.
      if (!structure.isActive) throw new AppError(409, `"${structure.name}" is inactive and cannot be assigned`);
    }
    await tx.employee.update({ where: { id: employeeId }, data: { salaryStructureId: body.salaryStructureId } });
    await writeAudit(tx, {
      entity: 'EMPLOYEE_SALARY_STRUCTURE',
      entityId: employeeId,
      action: 'UPDATE',
      changedBy: viewer.sub,
      before: { salaryStructure: employee.salaryStructure?.name ?? null },
      after: { salaryStructure: structure?.name ?? null },
    });
  });
  return getEmployee(viewer, employeeId);
}
