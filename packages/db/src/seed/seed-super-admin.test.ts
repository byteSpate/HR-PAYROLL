import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../client.js';
import { DEV_ADMIN_PASSWORD, seedSuperAdmin } from './seed-super-admin.js';

const EMAIL = 'zztest0a-seed@example.com';
const env = {
  SEED_ADMIN_EMAIL: EMAIL,
  SEED_ADMIN_PASSWORD: 'correct-horse-9',
} as NodeJS.ProcessEnv;

// The database allows one SUPER_ADMIN, so park any real one while a test needs the seat free.
let parked: string[] = [];
beforeEach(async () => {
  parked = (
    await prisma.user.findMany({ where: { accessLevel: 'SUPER_ADMIN' }, select: { id: true } })
  ).map((u) => u.id);
  await prisma.user.updateMany({ where: { id: { in: parked } }, data: { accessLevel: 'ADMIN' } });
});
afterEach(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  await prisma.user.updateMany({
    where: { id: { in: parked } },
    data: { accessLevel: 'SUPER_ADMIN' },
  });
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

  it('can skip the forced password change, so a shared dev password stays usable', async () => {
    const dev = {
      ...env,
      SEED_ADMIN_PASSWORD: DEV_ADMIN_PASSWORD,
      SEED_ADMIN_MUST_CHANGE_PASSWORD: 'false',
    } as NodeJS.ProcessEnv;
    expect(await seedSuperAdmin(prisma, dev)).toBe(EMAIL);
    expect(await prisma.user.findFirstOrThrow({ where: { email: EMAIL } })).toMatchObject({
      mustChangePassword: false,
    });
  });

  it('refuses the shared dev password in production, and creates nothing', async () => {
    const prod = {
      ...env,
      SEED_ADMIN_PASSWORD: DEV_ADMIN_PASSWORD,
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv;
    await expect(seedSuperAdmin(prisma, prod)).rejects.toThrow(/production/i);
    expect(await prisma.user.count({ where: { email: EMAIL } })).toBe(0);
  });

  it('accepts a real password in production, and still forces its change', async () => {
    const prod = { ...env, NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    expect(await seedSuperAdmin(prisma, prod)).toBe(EMAIL);
    expect(await prisma.user.findFirstOrThrow({ where: { email: EMAIL } })).toMatchObject({
      mustChangePassword: true,
    });
  });

  it('requires a password when an email is set', async () => {
    await expect(
      seedSuperAdmin(prisma, { SEED_ADMIN_EMAIL: EMAIL } as NodeJS.ProcessEnv),
    ).rejects.toThrow(/SEED_ADMIN_PASSWORD/);
  });
});
