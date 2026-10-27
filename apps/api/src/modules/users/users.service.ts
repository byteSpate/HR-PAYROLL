import { generateTemporaryPassword, hashPassword } from '@erp/auth';
import type { PublicUser } from '@erp/contracts/core';
import { createUserSchema, updateUserRolesSchema, updateUserStatusSchema } from '@erp/contracts/core';
import { prisma, type Tx } from '@erp/db';
import { AppError } from '@erp/utils';
import { z } from 'zod';
import { writeAudit } from '../../audit.js';
// auth and users are both part of the `core` manifest; the rule keys on directory names, which are not manifest modules.
// eslint-disable-next-line erp/module-deps
import { loadPublicUser } from '../auth/auth.service.js';
import { assertNotLastSuperAdmin, SUPER_ADMIN } from './last-admin.js';

interface Caller {
  id: string;
  permissions: readonly string[];
}

const emailSchema = z.email();

export async function listUsers(q?: string): Promise<PublicUser[]> {
  const term = q?.trim();
  const rows = await prisma.user.findMany({
    where: term
      ? { OR: [{ email: { contains: term, mode: 'insensitive' } }, { displayName: { contains: term, mode: 'insensitive' } }] }
      : {},
    select: { id: true },
    orderBy: { email: 'asc' },
  });
  return Promise.all(rows.map((r) => loadPublicUser(prisma, r.id)));
}

// Resolves ids to roles (400 on any unknown id) and says whether SUPER_ADMIN is among them.
async function resolveRoles(tx: Tx, roleIds: string[]) {
  const unique = [...new Set(roleIds)];
  const roles = await tx.role.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  if (roles.length !== unique.length) throw new AppError(400, 'Unknown role id');
  return roles;
}

// Handing out (or taking away) the top role is a role-administration act, not just user admin.
function assertMayTouchSuperAdmin(caller: Caller) {
  if (!caller.permissions.includes('role.manage')) {
    throw new AppError(403, 'Forbidden', 'role.manage');
  }
}

export async function createUser(input: unknown, caller: Caller) {
  const body = createUserSchema.parse(input);
  const email = body.email.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) throw new AppError(400, 'Invalid email');
  const displayName = body.displayName.trim();
  if (!displayName) throw new AppError(400, 'Display name is required');

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const id = await prisma.$transaction(async (tx) => {
    const roles = await resolveRoles(tx, body.roleIds);
    if (roles.some((r) => r.name === SUPER_ADMIN)) assertMayTouchSuperAdmin(caller);
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new AppError(409, 'An account with that email already exists');
    }
    const user = await tx.user.create({
      data: {
        email,
        displayName,
        passwordHash,
        mustChangePassword: true,
        roles: { create: roles.map((r) => ({ roleId: r.id })) },
      },
    });
    // The temporary password is deliberately absent from the audit row.
    await writeAudit(tx, {
      entity: 'USER',
      entityId: user.id,
      action: 'CREATE',
      changedBy: caller.id,
      after: { email, displayName, roles: roles.map((r) => r.name).sort() },
    });
    return user.id;
  });
  return { user: await loadPublicUser(prisma, id), temporaryPassword };
}

export async function updateUserRoles(userId: string, input: unknown, caller: Caller): Promise<PublicUser> {
  const { roleIds } = updateUserRolesSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { id: true, name: true } } } } },
    });
    if (!user) throw new AppError(404, 'User not found');
    const next = await resolveRoles(tx, roleIds);
    const current = user.roles.map((r) => r.role);

    const nextIds = new Set(next.map((r) => r.id));
    const currentIds = new Set(current.map((r) => r.id));
    const removed = current.filter((r) => !nextIds.has(r.id));
    const added = next.filter((r) => !currentIds.has(r.id));
    if (removed.length === 0 && added.length === 0) return;

    const removesSuperAdmin = removed.some((r) => r.name === SUPER_ADMIN);
    if (removesSuperAdmin || added.some((r) => r.name === SUPER_ADMIN)) assertMayTouchSuperAdmin(caller);
    await assertNotLastSuperAdmin(tx, { userId, removesSuperAdmin });

    await tx.userRole.deleteMany({ where: { userId, roleId: { in: removed.map((r) => r.id) } } });
    await tx.userRole.createMany({ data: added.map((r) => ({ userId, roleId: r.id })) });
    await writeAudit(tx, {
      entity: 'USER',
      entityId: userId,
      action: 'UPDATE',
      changedBy: caller.id,
      before: { roles: current.map((r) => r.name).sort() },
      after: { roles: next.map((r) => r.name).sort() },
    });
  });
  return loadPublicUser(prisma, userId);
}

export async function setUserStatus(userId: string, input: unknown, caller: Caller): Promise<PublicUser> {
  const { isActive } = updateUserStatusSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!user) throw new AppError(404, 'User not found');
    if (user.isActive === isActive) return;

    await assertNotLastSuperAdmin(tx, { userId, deactivates: !isActive });
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    // Without this the refresh cookie would keep minting access tokens for a locked-out account.
    if (!isActive) {
      await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await writeAudit(tx, {
      entity: 'USER',
      entityId: userId,
      action: 'UPDATE',
      changedBy: caller.id,
      before: { isActive: user.isActive },
      after: { isActive },
    });
  });
  return loadPublicUser(prisma, userId);
}
