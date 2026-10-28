import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../client.js';
import { seedSuperAdmin } from './seed-super-admin.js';

const EMAIL = 'zztest0a-seed@example.com';
const env = { SEED_ADMIN_EMAIL: EMAIL, SEED_ADMIN_PASSWORD: 'correct-horse-9' } as NodeJS.ProcessEnv;

// The database allows one SUPER_ADMIN, so park any real one while a test needs the seat free.
let parked: string[] = [];
beforeEach(async () => {
  parked = (await prisma.user.findMany({ where: { accessLevel: 'SUPER_ADMIN' }, select: { id: true } })).map((u) => u.id);
  await prisma.user.updateMany({ where: { id: { in: parked } }, data: { accessLevel: 'ADMIN' } });
});
afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.user.updateMany({ where: { id: { in: parked } }, data: { accessLevel: 'SUPER_ADMIN' } });
});

describe('seedSuperAdmin', () => {
  it('creates the super admin once and is a no-op afterwards', async () => {
    expect(await seedSuperAdmin(prisma, env)).toBe(EMAIL);
    expect(await seedSuperAdmin(prisma, env)).toBeNull();
    const rows = await prisma.user.findMany({ where: { accessLevel: 'SUPER_ADMIN' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: EMAIL, mustChangePassword: true, roleId: null });
  });

  it('creates nothing when SEED_ADMIN_EMAIL is unset', async () => {
    expect(await seedSuperAdmin(prisma, {} as NodeJS.ProcessEnv)).toBeNull();
    expect(await prisma.user.count({ where: { accessLevel: 'SUPER_ADMIN' } })).toBe(0);
  });

  it('requires a password when an email is set', async () => {
    await expect(seedSuperAdmin(prisma, { SEED_ADMIN_EMAIL: EMAIL } as NodeJS.ProcessEnv)).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
  });
});
