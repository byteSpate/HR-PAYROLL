import { roleSchema } from '@erp/contracts/core';
import { fromDbScope, prisma, toDbScope, type Tx } from '@erp/db';
import type { Scope } from '@erp/auth';
import { AppError } from '@erp/utils';
import { writeAudit } from '../../audit.js';
import { assertMayGrant, type Caller, type GrantRequest } from './guards.js';

export interface RoleView {
  id: string;
  name: string;
  description: string | null;
  permissions: GrantRequest[];
  userCount: number;
}

const patchSchema = roleSchema.partial();

const roleInclude = { permissions: true, _count: { select: { users: true } } } as const;

type RoleRow = Awaited<ReturnType<typeof prisma.role.findMany<{ include: typeof roleInclude }>>>[number];

// Audit rows and comparisons use the same 'key' / 'key:scope' spelling as tokens.
const grantId = (g: GrantRequest) => (g.scope ? `${g.permissionKey}:${g.scope}` : g.permissionKey);

function toView(role: RoleRow): RoleView {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    permissions: role.permissions
      .map((p) => ({ permissionKey: p.permissionKey, scope: p.scope ? fromDbScope(p.scope) : null }))
      .sort((a, b) => a.permissionKey.localeCompare(b.permissionKey)),
    userCount: role._count.users,
  };
}

async function view(db: Tx | typeof prisma, id: string): Promise<RoleView> {
  const role = await db.role.findUnique({ where: { id }, include: roleInclude });
  if (!role) throw new AppError(404, 'Role not found');
  return toView(role);
}

// One read, so a role deleted concurrently cannot 404 the whole list.
export async function listRoles(): Promise<RoleView[]> {
  const roles = await prisma.role.findMany({ include: roleInclude, orderBy: { name: 'asc' } });
  return roles.map(toView);
}

export async function listPermissionGroups() {
  const rows = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { key: 'asc' }] });
  const groups = new Map<string, { key: string; label: string; scopes: Scope[] }[]>();
  for (const p of rows) {
    const list = groups.get(p.module) ?? [];
    list.push({ key: p.key, label: p.label, scopes: p.scopes.map(fromDbScope) });
    groups.set(p.module, list);
  }
  return [...groups].map(([module, permissions]) => ({ module, permissions }));
}

// Each key may appear once (it is the primary key), must exist, and its scope must be one the
// permission declares: on/off permissions take null, scoped ones need one of their scopes.
async function checkedGrants(tx: Tx, grants: GrantRequest[]): Promise<GrantRequest[]> {
  const keys = grants.map((g) => g.permissionKey);
  if (new Set(keys).size !== keys.length) throw new AppError(400, 'A permission can be granted only once per role');
  const known = await tx.permission.findMany({ where: { key: { in: keys } }, select: { key: true, scopes: true } });
  const byKey = new Map(known.map((p) => [p.key, p.scopes.map(fromDbScope)]));
  const unknown = keys.filter((k) => !byKey.has(k));
  if (unknown.length > 0) throw new AppError(400, `Unknown permission: ${unknown.join(', ')}`);
  for (const g of grants) {
    const declared = byKey.get(g.permissionKey)!;
    if (declared.length === 0 && g.scope !== null) {
      throw new AppError(400, `${g.permissionKey} is on/off and takes no scope`);
    }
    if (declared.length > 0 && (g.scope === null || !declared.includes(g.scope))) {
      throw new AppError(400, `${g.permissionKey} needs one of these scopes: ${declared.join(', ')}`);
    }
  }
  return [...grants].sort((a, b) => a.permissionKey.localeCompare(b.permissionKey));
}

const toRow = (g: GrantRequest) => ({ permissionKey: g.permissionKey, scope: g.scope ? toDbScope(g.scope) : null });

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError(400, 'Role name is required');
  return trimmed;
}

async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const clash = await tx.role.findUnique({ where: { name }, select: { id: true } });
  if (clash && clash.id !== exceptId) throw new AppError(409, 'A role with that name already exists');
}

export async function createRole(input: unknown, caller: Caller): Promise<RoleView> {
  const changedBy = caller.sub;
  const body = roleSchema.parse(input);
  const name = cleanName(body.name);
  const id = await prisma.$transaction(async (tx) => {
    const permissions = await checkedGrants(tx, body.permissions);
    assertMayGrant(caller, permissions);
    await assertNameFree(tx, name);
    const role = await tx.role.create({
      data: {
        name,
        description: body.description ?? null,
        permissions: { create: permissions.map(toRow) },
      },
    });
    await writeAudit(tx, {
      entity: 'ROLE',
      entityId: role.id,
      action: 'CREATE',
      changedBy,
      after: { name, description: body.description ?? null, permissions: permissions.map(grantId) },
    });
    return role.id;
  });
  return view(prisma, id);
}

export async function updateRole(id: string, input: unknown, caller: Caller): Promise<RoleView> {
  const changedBy = caller.sub;
  const body = patchSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    const current = await view(tx, id);
    const permissions = body.permissions ? await checkedGrants(tx, body.permissions) : undefined;
    // Only grants new to the role count: a role editor may keep or drop what they do not hold.
    if (permissions) {
      const had = new Set(current.permissions.map(grantId));
      assertMayGrant(caller, permissions.filter((g) => !had.has(grantId(g))));
    }
    const name = body.name === undefined ? undefined : cleanName(body.name);

    const nameChanged = name !== undefined && name !== current.name;
    const permsChanged =
      permissions !== undefined && permissions.map(grantId).join() !== current.permissions.map(grantId).join();
    if (nameChanged) await assertNameFree(tx, name, id);

    const descriptionChanged = body.description !== undefined && body.description !== current.description;
    if (!nameChanged && !permsChanged && !descriptionChanged) return;

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (nameChanged) [before['name'], after['name']] = [current.name, name];
    if (descriptionChanged) [before['description'], after['description']] = [current.description, body.description];
    if (permsChanged) [before['permissions'], after['permissions']] = [current.permissions.map(grantId), permissions.map(grantId)];

    await tx.role.update({
      where: { id },
      data: { ...(nameChanged ? { name } : {}), ...(descriptionChanged ? { description: body.description } : {}) },
    });
    if (permsChanged) {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({ data: permissions.map((g) => ({ roleId: id, ...toRow(g) })) });
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
    if (role.userCount > 0) throw new AppError(409, 'Role is assigned to users');
    await tx.role.delete({ where: { id } });
    await writeAudit(tx, {
      entity: 'ROLE',
      entityId: id,
      action: 'DELETE',
      changedBy,
      before: { name: role.name, description: role.description, permissions: role.permissions.map(grantId) },
    });
  });
}
