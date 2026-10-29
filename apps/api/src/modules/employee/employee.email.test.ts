import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors } from '../../test-utils/access.js';
import { hireActor, makeDepartment } from '../../test-utils/people.js';

const prefix = 'zzempmail';
const app = createApp();
let departmentId: string;
let hr: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  hr = await hireActor(prefix, departmentId, ['employee.read:all', 'employee.update:all']);
  alice = await hireActor(prefix, departmentId);
  bob = await hireActor(prefix, departmentId);
});
afterAll(async () => {
  await prisma.emailDispatch.deleteMany({ where: { to: { startsWith: prefix } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'USER_ACCOUNT', changedBy: hr.user.id } });
  await prisma.employee.deleteMany({ where: { departmentId } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
  await cleanActors(prefix);
});

const change = (who: { header: Record<string, string> }, newEmail: string) =>
  request(app)
    .patch(`/api/employees/${alice.employee.id}/email`)
    .set(who.header)
    .send({ newEmail });

describe('PATCH /api/employees/:id/email', () => {
  it('needs employee.update, refuses a taken address and the same one', async () => {
    expect((await change(alice, `${prefix}-x@example.com`)).status).toBe(403);
    expect((await change(hr, bob.user.email)).status).toBe(409);
    expect((await change(hr, alice.user.email)).status).toBe(400);
  });

  it('applies at once, signs the person out, tells both addresses and reissues an unused invite', async () => {
    await prisma.user.update({ where: { id: alice.user.id }, data: { mustChangePassword: true } });
    await prisma.refreshToken.create({
      data: {
        userId: alice.user.id,
        tokenHash: `${prefix}-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const oldHash = (await prisma.user.findUniqueOrThrow({ where: { id: alice.user.id } }))
      .passwordHash;
    const previous = alice.user.email;
    const next = `${prefix}-actor-new@example.com`;
    const res = await change(hr, next);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: next, previousEmail: previous, inviteResent: true });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: alice.user.id } });
    expect(user.email).toBe(next);
    expect(user.passwordHash).not.toBe(oldHash);
    expect(
      await prisma.refreshToken.count({ where: { userId: alice.user.id, revokedAt: null } }),
    ).toBe(0);
    expect(
      await prisma.emailDispatch.count({
        where: { kind: 'EMAIL_CHANGED', to: { in: [previous, next] } },
      }),
    ).toBe(2);
    expect(await prisma.emailDispatch.count({ where: { kind: 'CREDENTIALS', to: next } })).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { entity: 'USER_ACCOUNT', entityId: alice.user.id } }),
    ).toBe(1);
  });
});
