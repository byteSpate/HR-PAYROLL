import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyPassword } from '@erp/auth';
import { prisma } from '../client.js';
import { resetSuperAdminPassword } from './reset-super-admin-password.js';
import { transferSuperAdmin } from './transfer-super-admin.js';

const A = 'zztest0a-cli-a@example.com';
const B = 'zztest0a-cli-b@example.com';
const C = 'zztest0a-cli-c@example.com';

let parked: string[] = [];
beforeEach(async () => {
  parked = (await prisma.user.findMany({ where: { accessLevel: 'SUPER_ADMIN' }, select: { id: true } })).map((u) => u.id);
  await prisma.user.updateMany({ where: { id: { in: parked } }, data: { accessLevel: 'ADMIN' } });
  await prisma.user.create({ data: { email: A, passwordHash: 'x', accessLevel: 'SUPER_ADMIN' } });
  await prisma.user.create({ data: { email: B, passwordHash: 'x' } });
  await prisma.user.create({ data: { email: C, passwordHash: 'x', isActive: false } });
});
afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: [A, B, C] } }, select: { id: true } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: [A, B, C] } } });
  await prisma.user.updateMany({ where: { id: { in: parked } }, data: { accessLevel: 'SUPER_ADMIN' } });
});

const level = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).accessLevel;

describe('transferSuperAdmin', () => {
  it('moves the seat atomically: old owner becomes ADMIN, new owner SUPER_ADMIN', async () => {
    await transferSuperAdmin(prisma, B);
    expect(await level(A)).toBe('ADMIN');
    expect(await level(B)).toBe('SUPER_ADMIN');
    expect(await prisma.user.count({ where: { accessLevel: 'SUPER_ADMIN' } })).toBe(1);
  });

  it('refuses an unknown, deactivated or already-owning target and changes nothing', async () => {
    await expect(transferSuperAdmin(prisma, 'zztest0a-nobody@example.com')).rejects.toThrow(/No user/);
    await expect(transferSuperAdmin(prisma, C)).rejects.toThrow(/deactivated/);
    await expect(transferSuperAdmin(prisma, A)).rejects.toThrow(/already/);
    expect(await level(A)).toBe('SUPER_ADMIN');
  });
});

describe('resetSuperAdminPassword', () => {
  it('sets a verifiable temporary password and forces a change', async () => {
    const { email, temporaryPassword } = await resetSuperAdminPassword(prisma);
    expect(email).toBe(A);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: A } });
    expect(row.mustChangePassword).toBe(true);
    expect(await verifyPassword(temporaryPassword, row.passwordHash)).toBe(true);
  });
});

describe('one_super_admin index', () => {
  it('rejects a second SUPER_ADMIN row at the database level', async () => {
    await expect(prisma.user.update({ where: { email: B }, data: { accessLevel: 'SUPER_ADMIN' } })).rejects.toThrow();
    await expect(
      prisma.user.create({ data: { email: 'zztest0a-second@example.com', passwordHash: 'x', accessLevel: 'SUPER_ADMIN' } }),
    ).rejects.toThrow();
  });
});
