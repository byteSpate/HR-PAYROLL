import { roleSchema } from '@erp/contracts/core';
import { prisma, type Tx } from '@erp/db';
import { AppError } from '@erp/utils';
import { writeAudit } from '../../audit.js';
import { SUPER_ADMIN } from './last-admin.js';

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

export interface Caller {
  id: string;
  permissions: string[];
}

const patchSchema = roleSchema.partial();

async function view(db: Tx | typeof prisma, id: string): Promise<RoleView> {
  const role = await db.role.findUnique({
    where: { id },
    include: { permissions: true, _count: { select: { users: true } } },
  });
  if (!role) throw new AppError(404, 'Role not found');
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions.map((p) => p.permissionKey).sort(),
    userCount: role._count.users,
  };
}

export async function listRoles(): Promise<RoleView[]> {
  const roles = await prisma.role.findMany({ select: { id: true }, orderBy: { name: 'asc' } });
  return Promise.all(roles.map((r) => view(prisma, r.id)));
}

export async function listPermissionGroups() {
  const rows = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  const groups = new Map<string, { key: string; label: string }[]>();
  for (const p of rows) {
    const list = groups.get(p.module) ?? [];
    list.push({ key: p.key, label: p.label });
    groups.set(p.module, list);
  }
  return [...groups].map(([module, permissions]) => ({ module, permissions }));
}

async function checkedPermissions(tx: Tx, keys: string[]): Promise<string[]> {
  const unique = [...new Set(keys)].sort();
  const known = await tx.permission.findMany({ where: { key: { in: unique } }, select: { key: true } });
  const unknown = unique.filter((k) => !known.some((p) => p.key === k));
  if (unknown.length > 0) throw new AppError(400, `Unknown permission: ${unknown.join(', ')}`);
  return unique;
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError(400, 'Role name is required');
  return trimmed;
}

async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.role.findUnique({ where: { name }, select: { id: true } });
  if (clash && clash.id !== exceptId) throw new AppError(409, 'A role with that name already exists');
}

// Without this a role.manage holder could add user.manage to a role they hold and escalate.
function assertMayAdd(added: string[], held: string[]) {
  if (added.some((k) => !held.includes(k))) throw new AppError(403, 'Cannot add permissions you do not hold');
}

export async function createRole(input: unknown, caller: Caller): Promise<RoleView> {
  const changedBy = caller.id;
  const body = roleSchema.parse(input);
  const name = cleanName(body.name);
  const id = await prisma.$transaction(async (tx) => {
    const permissions = await checkedPermissions(tx, body.permissions);
    assertMayAdd(permissions, caller.permissions);
    await assertNameFree(tx, name);
    const role = await tx.role.create({
      data: {
        name,
        description: body.description ?? null,
        permissions: { create: permissions.map((permissionKey) => ({ permissionKey })) },
      },
    });
    await writeAudit(tx, {
      entity: 'ROLE',
      entityId: role.id,
      action: 'CREATE',
      changedBy,
      after: { name, description: body.description ?? null, permissions },
    });
    return role.id;
  });
  return view(prisma, id);
}

export async function updateRole(id: string, input: unknown, caller: Caller): Promise<RoleView> {
  const changedBy = caller.id;
  const body = patchSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const current = await view(tx, id);
    const permissions = body.permissions ? await checkedPermissions(tx, body.permissions) : undefined;
    if (permissions) assertMayAdd(permissions.filter((k) => !current.permissions.includes(k)), caller.permissions);
    const name = body.name === undefined ? undefined : cleanName(body.name);

    const nameChanged = name !== undefined && name !== current.name;
    const permsChanged = permissions !== undefined && permissions.join() !== current.permissions.join();
    // SUPER_ADMIN must always be able to do everything; system names are referenced by code.
    if (current.name === SUPER_ADMIN && (nameChanged || permsChanged)) {
      throw new AppError(409, 'SUPER_ADMIN cannot be renamed or have its permissions changed');
    }
    if (current.isSystem && nameChanged) throw new AppError(409, 'System roles cannot be renamed');
    if (nameChanged) await assertNameFree(tx, name, id);

    const descriptionChanged = body.description !== undefined && body.description !== current.description;
    if (!nameChanged && !permsChanged && !descriptionChanged) return;

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (nameChanged) [before['name'], after['name']] = [current.name, name];
    if (descriptionChanged) [before['description'], after['description']] = [current.description, body.description];
    if (permsChanged) [before['permissions'], after['permissions']] = [current.permissions, permissions];

    await tx.role.update({
      where: { id },
      data: { ...(nameChanged ? { name } : {}), ...(descriptionChanged ? { description: body.description } : {}) },
    });
    if (permsChanged) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: permissions.map((permissionKey) => ({ roleId: id, permissionKey })) });
    }
    await writeAudit(tx, {
      entity: 'ROLE',
      entityId: id,
      action: 'UPDATE',
      changedBy,
      before: before as never,
      after: after as never,
    });
  });
  return view(prisma, id);
}

export async function deleteRole(id: string, changedBy: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const role = await view(tx, id);
    if (role.isSystem) throw new AppError(409, 'System roles cannot be deleted');
    if (role.userCount > 0) throw new AppError(409, 'Role is assigned to users');
    await tx.role.delete({ where: { id } });
    await writeAudit(tx, {
      entity: 'ROLE',
      entityId: id,
      action: 'DELETE',
      changedBy,
      before: { name: role.name, description: role.description, permissions: role.permissions },
    });
  });
}
