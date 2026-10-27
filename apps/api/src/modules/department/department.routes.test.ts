import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zztest7';
const manager = bearer('u-dept-manager', 'STANDARD', ['department.read', 'department.manage']);
const reader = bearer('u-dept-reader', 'STANDARD', ['department.read']);

afterEach(async () => {
  const depts = await prisma.department.findMany({ where: { name: { startsWith: PREFIX, mode: 'insensitive' } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'DEPARTMENT', entityId: { in: depts.map((d) => d.id) } } });
  await prisma.department.deleteMany({ where: { id: { in: depts.map((d) => d.id) } } });
});

const create = (name: string) => request(app).post('/api/departments').set(manager).send({ name });

describe('departments api', () => {
  it('requires department.read to list and department.manage to change', async () => {
    expect((await request(app).get('/api/departments').set(bearer('u-x', 'STANDARD', []))).status).toBe(403);
    expect((await request(app).post('/api/departments').set(reader).send({ name: `${PREFIX} A` })).status).toBe(403);
  });

  it('creates a department with a trimmed name, lists it by name, and audits it', async () => {
    const res = await create(`  ${PREFIX} Sales `);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: `${PREFIX} Sales`, employeeCount: 0 });

    const list = await request(app).get('/api/departments').set(reader);
    expect(list.body.filter((d: { name: string }) => d.name.startsWith(PREFIX))).toEqual([res.body]);
    expect(await prisma.auditLog.count({ where: { entity: 'DEPARTMENT', entityId: res.body.id, action: 'CREATE' } })).toBe(1);
  });

  it('refuses a duplicate name regardless of case with 409', async () => {
    await create(`${PREFIX} Sales`);
    const res = await create(`${PREFIX} SALES`);
    expect(res.status).toBe(409);
  });

  it('renames, refusing a name another department has', async () => {
    const a = (await create(`${PREFIX} A`)).body;
    await create(`${PREFIX} B`);
    expect((await request(app).patch(`/api/departments/${a.id}`).set(manager).send({ name: `${PREFIX} b` })).status).toBe(409);
    const ok = await request(app).patch(`/api/departments/${a.id}`).set(manager).send({ name: `${PREFIX} Alpha` });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe(`${PREFIX} Alpha`);
  });

  it('allows renaming a department to a different case of its own name', async () => {
    const a = (await create(`${PREFIX} ops`)).body;
    expect((await request(app).patch(`/api/departments/${a.id}`).set(manager).send({ name: `${PREFIX} Ops` })).status).toBe(200);
  });

  it('deletes an empty department with 204 and answers 404 for an unknown one', async () => {
    const a = (await create(`${PREFIX} Temp`)).body;
    expect((await request(app).delete(`/api/departments/${a.id}`).set(manager)).status).toBe(204);
    expect((await request(app).delete(`/api/departments/${a.id}`).set(manager)).status).toBe(404);
  });

  it('rejects a blank name with 400', async () => {
    expect((await create('   ')).status).toBe(400);
  });

  it('exports the list as csv', async () => {
    await create(`${PREFIX} Export`);
    const res = await request(app).get('/api/departments/export?format=csv').set(reader);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`${PREFIX} Export`);
  });
});
