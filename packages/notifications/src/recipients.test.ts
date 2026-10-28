import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@erp/db';
import { approverUserIds } from './recipients.js';

const PREFIX = 'zznotif-rcpt';
const stamp = Date.now();
let seq = 0;
let departmentId = '';

const mkUser = (label: string, data: { accessLevel?: 'ADMIN' | 'STANDARD'; isActive?: boolean; roleId?: string } = {}) =>
  prisma.user.create({
    data: { email: `${PREFIX}-${label}-${stamp}-${seq++}@example.com`, passwordHash: 'x', ...data },
  });

const mkEmployee = async (userId: string, reportingManagerId?: string) => {
  seq += 1;
  return prisma.employee.create({
    data: {
      userId,
      employeeCode: `ZZR-${stamp}-${seq}`,
      fullName: `Person ${seq}`,
      designation: 'Engineer',
      departmentId,
      employmentType: 'FULL_TIME',
      joiningDate: new Date('2026-01-05T00:00:00Z'),
      reportingManagerId: reportingManagerId ?? null,
    },
  });
};

beforeAll(async () => {
  departmentId = (await prisma.department.create({ data: { name: `ZZR dept ${stamp}` } })).id;
  await prisma.permission.upsert({
    where: { key: 'zzr.approve' },
    update: {},
    create: { key: 'zzr.approve', label: 'test', module: 'zzr', scopes: ['TEAM', 'DEPARTMENT', 'ALL'] },
  });
});

afterAll(async () => {
  await prisma.employee.updateMany({ where: { user: { email: { startsWith: PREFIX } } }, data: { reportingManagerId: null } });
  await prisma.employee.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
  await prisma.role.deleteMany({ where: { name: { startsWith: 'ZZR_' } } });
  await prisma.permission.deleteMany({ where: { key: 'zzr.approve' } });
  await prisma.department.deleteMany({ where: { id: departmentId } });
});

describe('approverUserIds', () => {
  it('returns the active reporting manager and nobody else', async () => {
    const manager = await mkUser('mgr');
    const mEmp = await mkEmployee(manager.id);
    const staff = await mkUser('staff');
    const sEmp = await mkEmployee(staff.id, mEmp.id);
    const admin = await mkUser('admin1', { accessLevel: 'ADMIN' });

    const ids = await prisma.$transaction((tx) => approverUserIds(tx, sEmp.id, 'zzr.approve'));
    expect(ids).toEqual([manager.id]);
    expect(ids).not.toContain(admin.id);
  });

  it('falls back to admins and all-scope role holders when the manager is inactive', async () => {
    const manager = await mkUser('mgr2', { isActive: false });
    const mEmp = await mkEmployee(manager.id);
    const staff = await mkUser('staff2');
    const sEmp = await mkEmployee(staff.id, mEmp.id);
    const admin = await mkUser('admin2', { accessLevel: 'ADMIN' });
    const role = await prisma.role.create({
      data: { name: `ZZR_ALL_${stamp}`, permissions: { create: [{ permissionKey: 'zzr.approve', scope: 'ALL' }] } },
    });
    const holder = await mkUser('holder', { roleId: role.id });
    const teamRole = await prisma.role.create({
      data: { name: `ZZR_TEAM_${stamp}`, permissions: { create: [{ permissionKey: 'zzr.approve', scope: 'TEAM' }] } },
    });
    const teamHolder = await mkUser('teamholder', { roleId: teamRole.id });

    const ids = await prisma.$transaction((tx) => approverUserIds(tx, sEmp.id, 'zzr.approve'));
    expect(ids).toContain(admin.id);
    expect(ids).toContain(holder.id);
    expect(ids).not.toContain(teamHolder.id);
    expect(ids).not.toContain(manager.id);
  });

  it('falls back to admins when there is no manager, and skips inactive admins', async () => {
    const staff = await mkUser('staff3');
    const sEmp = await mkEmployee(staff.id);
    const admin = await mkUser('admin3', { accessLevel: 'ADMIN' });
    const gone = await mkUser('admin4', { accessLevel: 'ADMIN', isActive: false });

    const ids = await prisma.$transaction((tx) => approverUserIds(tx, sEmp.id, 'zzr.approve'));
    expect(ids).toContain(admin.id);
    expect(ids).not.toContain(gone.id);
  });

  it('never includes the employee\'s own user, even an admin employee', async () => {
    const adminStaff = await mkUser('selfadmin', { accessLevel: 'ADMIN' });
    const sEmp = await mkEmployee(adminStaff.id);
    const ids = await prisma.$transaction((tx) => approverUserIds(tx, sEmp.id, 'zzr.approve'));
    expect(ids).not.toContain(adminStaff.id);
  });

  it('returns nothing for an unknown employee', async () => {
    expect(await prisma.$transaction((tx) => approverUserIds(tx, '00000000-0000-4000-8000-000000000000', 'zzr.approve'))).toEqual([]);
  });
});
