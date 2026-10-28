import { generateTemporaryPassword, hashPassword } from '@erp/auth';
import type { PublicUser } from '@erp/contracts/core';
import { createUserSchema, updateUserRoleSchema, updateUserStatusSchema } from '@erp/contracts/core';
import { fromDbScope, prisma, type Tx } from '@erp/db';
import { AppError } from '@erp/utils';
import { z } from 'zod';
import { writeAudit } from '@erp/audit';
import { loadPublicUser } from '../auth/auth.service.js';
import { loadActor } from './actor.js';
import { assertCanActOn, assertMayGrant, type Caller } from './guards.js';

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

export function listRoleOptions() {
  return prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

// Null clears the role. The role's grants must all be ones the caller may hand out.
async function resolveRole(tx: Tx, roleId: string | null | undefined, caller: Caller) {
  if (!roleId) return null;
  const role = await tx.role.findUnique({
    where: { id: roleId },
    select: { id: true, name: true, permissions: { select: { permissionKey: true, scope: true } } },
  });
  if (!role) throw new AppError(400, 'Unknown role id');
  assertMayGrant(
    caller,
    role.permissions.map((p) => ({ permissionKey: p.permissionKey, scope: p.scope ? fromDbScope(p.scope) : null })),
  );
  return role;
}

/**
 * The one place a STANDARD account is created, shared by user admin and employee onboarding so both
 * apply the same role-grant check and duplicate-email rule. Always STANDARD: admins are appointed by
 * the super admin through the access-level endpoint. The temporary password never reaches the audit row.
 */
export async function insertStandardUser(
  tx: Tx,
  input: { email: string; displayName: string; roleId?: string | null },
  actor: Caller,
): Promise<{ id: string; temporaryPassword: string }> {
  const role = await resolveRole(tx, input.roleId, actor);
  if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new AppError(409, 'An account with that email already exists');
  }
  const temporaryPassword = generateTemporaryPassword();
  const user = await tx.user.create({
    data: {
      email: input.email,
      displayName: input.displayName,
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      accessLevel: 'STANDARD',
      roleId: role?.id ?? null,
    },
  });
  await writeAudit(tx, {
    entity: 'USER',
    entityId: user.id,
    action: 'CREATE',
    changedBy: actor.sub,
    after: { email: input.email, displayName: input.displayName, role: role?.name ?? null },
  });
  return { id: user.id, temporaryPassword };
}

export async function createUser(input: unknown, caller: Caller) {
  const body = createUserSchema.parse(input);
  const email = body.email.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) throw new AppError(400, 'Invalid email');
  const displayName = body.displayName.trim();
  if (!displayName) throw new AppError(400, 'Display name is required');

  const { id, temporaryPassword } = await prisma.$transaction(async (tx) => {
    const actor = await loadActor(tx, caller.sub, 'user.manage');
    return insertStandardUser(tx, { email, displayName, roleId: body.roleId }, actor);
  });
  return { user: await loadPublicUser(prisma, id), temporaryPassword };
}

export async function setUserRole(userId: string, input: unknown, caller: Caller): Promise<PublicUser> {
  const { roleId } = updateUserRoleSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const actor = await loadActor(tx, caller.sub, 'user.manage');
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, accessLevel: true, role: { select: { id: true, name: true } } },
    });
    if (!user) throw new AppError(404, 'User not found');
    assertCanActOn(actor, user);
    if (user.accessLevel !== 'STANDARD') throw new AppError(409, 'Admins hold every permission and take no role');

    const next = await resolveRole(tx, roleId, actor);
    if ((next?.id ?? null) === (user.role?.id ?? null)) return;

    await tx.user.update({ where: { id: userId }, data: { roleId: next?.id ?? null } });
    await writeAudit(tx, {
      entity: 'USER',
      entityId: userId,
      action: 'UPDATE',
      changedBy: caller.sub,
      before: { role: user.role?.name ?? null },
      after: { role: next?.name ?? null },
    });
  });
  return loadPublicUser(prisma, userId);
}

/**
 * Activates or deactivates a login inside the caller's transaction. Shared by user admin and the
 * employee module (account toggle, exit), so the super-admin and admin guards always apply.
 */
export async function applyUserStatus(tx: Tx, userId: string, isActive: boolean, actor: Caller): Promise<void> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true, accessLevel: true } });
  if (!user) throw new AppError(404, 'User not found');
  assertCanActOn(actor, user);
  if (user.isActive === isActive) return;

  await tx.user.update({ where: { id: userId }, data: { isActive } });
  // Without this the refresh cookie would keep minting access tokens for a locked-out account.
  if (!isActive) {
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await writeAudit(tx, {
    entity: 'USER',
    entityId: userId,
    action: 'UPDATE',
    changedBy: actor.sub,
    before: { isActive: user.isActive },
    after: { isActive },
  });
}

export async function setUserStatus(userId: string, input: unknown, caller: Caller): Promise<PublicUser> {
  const { isActive } = updateUserStatusSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const actor = await loadActor(tx, caller.sub, 'user.manage');
    await applyUserStatus(tx, userId, isActive, actor);
  });
  return loadPublicUser(prisma, userId);
}
