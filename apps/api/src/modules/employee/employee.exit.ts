import { accountStatusSchema, exitSchema, type EmployeeView } from '@erp/contracts/employee';
import { writeAudit } from '@erp/audit';
import { prisma, type Tx } from '@erp/db';
import { emit } from '@erp/events';
import { officeToday } from '@erp/export';
import { AppError } from '@erp/utils';
import { loadActor } from '../users/actor.js';
import { applyUserStatus } from '../users/users.service.js';
import { reaches, type Viewer } from './employee.access.js';
import { getEmployee, viewerEmployeeOf } from './employee.service.js';

// Reasons where the employer ends the employment; everything else is the employee leaving.
const TERMINATING = new Set(['TERMINATION', 'DISMISSAL', 'DISCHARGE', 'RETRENCHMENT']);

async function loadForAction(tx: Tx, viewer: Viewer, id: string, key: string) {
  const actor = await loadActor(tx, viewer.sub);
  const employee = await tx.employee.findUnique({ where: { id } });
  if (!employee) throw new AppError(404, 'Employee not found');
  if (!reaches(actor, await viewerEmployeeOf(tx, viewer.sub), employee, key)) throw new AppError(403, 'Forbidden', key);
  return { actor, employee };
}

export async function recordExit(viewer: Viewer, id: string, input: unknown): Promise<EmployeeView> {
  const body = exitSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const { actor, employee } = await loadForAction(tx, viewer, id, 'employee.exit');
    const lastWorkingDay = new Date(`${body.lastWorkingDay}T00:00:00.000Z`);
    if (lastWorkingDay < employee.joiningDate) {
      throw new AppError(400, 'The last working day cannot precede the joining date');
    }
    const employmentStatus = TERMINATING.has(body.exitReason) ? 'TERMINATED' : 'RESIGNED';
    await tx.employee.update({
      where: { id },
      data: { lastWorkingDay, exitReason: body.exitReason, exitNote: body.exitNote ?? null, employmentStatus },
    });
    // The worker (Plan 7) will deactivate future leavers on the day; until then only past days do.
    if (lastWorkingDay <= officeToday()) await applyUserStatus(tx, employee.userId, false, actor);
    await writeAudit(tx, {
      entity: 'EMPLOYEE',
      entityId: id,
      action: 'EXIT',
      changedBy: viewer.sub,
      after: { lastWorkingDay: body.lastWorkingDay, exitReason: body.exitReason, employmentStatus },
    });
    await emit(tx, 'employee.exited', { employeeId: id, lastWorkingDay: body.lastWorkingDay, exitReason: body.exitReason });
  });
  return getEmployee(viewer, id);
}

export async function setAccountActive(viewer: Viewer, id: string, input: unknown): Promise<EmployeeView> {
  const { isActive } = accountStatusSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const { actor, employee } = await loadForAction(tx, viewer, id, 'employee.update');
    await applyUserStatus(tx, employee.userId, isActive, actor);
  });
  return getEmployee(viewer, id);
}
