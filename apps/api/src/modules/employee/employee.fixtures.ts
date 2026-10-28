// Shared by the employee test files; not imported by production code.
import request from 'supertest';
import { expect } from 'vitest';
import type { Express } from 'express';
import { prisma } from '@erp/db';
import { bearer } from '../../test-utils/access.js';

let seq = 0;

export interface Hired {
  id: string;
  userId: string;
  as: { Authorization: string };
  body: { employee: { id: string; work: { email: string; fullName: string } }; temporaryPassword: string };
}

export async function hire(
  app: Express,
  prefix: string,
  hr: { Authorization: string },
  departmentId: string,
  over: Record<string, unknown> = {},
): Promise<Hired> {
  seq += 1;
  const res = await request(app)
    .post('/api/employees')
    .set(hr)
    .send({
      email: `${prefix}-${Date.now()}-${seq}@example.com`,
      fullName: `Person ${seq}`,
      designation: 'Engineer',
      departmentId,
      employmentType: 'FULL_TIME',
      joiningDate: '2026-01-05',
      ...over,
    });
  expect(res.status).toBe(201);
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: res.body.employee.id } });
  return { id: emp.id, userId: emp.userId, as: bearer(emp.userId, 'STANDARD', []), body: res.body };
}

/** Employees hired by a test file, their logins, audit rows and events. Actor accounts are kept. */
export async function removeEmployees(prefix: string): Promise<void> {
  const emps = await prisma.employee.findMany({
    where: { user: { email: { startsWith: prefix } } },
    select: { id: true, userId: true },
  });
  const ids = emps.map((e) => e.id);
  const userIds = emps.map((e) => e.userId);
  await prisma.employee.updateMany({ where: { id: { in: ids } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { id: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [...ids, ...userIds] } } });
  await prisma.outboxEvent.deleteMany({ where: { type: { startsWith: 'employee.' } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
