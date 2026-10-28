import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zztest7i';
const importer = bearer('u-dept-importer', 'STANDARD', ['department.import']);

afterEach(async () => {
  const depts = await prisma.department.findMany({ where: { name: { startsWith: PREFIX, mode: 'insensitive' } } });
  await prisma.auditLog.deleteMany({ where: { entity: 'DEPARTMENT', entityId: { in: depts.map((d) => d.id) } } });
  await prisma.department.deleteMany({ where: { id: { in: depts.map((d) => d.id) } } });
});

const csv = (names: string[]) => Buffer.from(['name', ...names].join('\r\n'));
// In a one-column file a blank name is just an empty line, which the parser skips; an over-long
// name is the invalid row instead.
const TOO_LONG = `${PREFIX} ${'x'.repeat(100)}`;
const send = (path: string, names: string[]) =>
  request(app)
    .post(`/api/departments/import/${path}`)
    .set(importer)
    .attach('file', csv(names), { filename: 'departments.csv', contentType: 'text/csv' });

describe('department import', () => {
  it('requires department.import', async () => {
    const res = await request(app).get('/api/departments/import/guide').set(bearer('u-x', 'STANDARD', []));
    expect(res.status).toBe(403);
  });

  it('serves the guide and an example template', async () => {
    const guide = await request(app).get('/api/departments/import/guide').set(importer);
    expect(guide.status).toBe(200);
    const template = await request(app).get('/api/departments/import/template?format=xlsx').set(importer);
    expect(template.status).toBe(200);
  });

  it('previews per-row issues for a case-insensitive duplicate and an invalid name, writing nothing', async () => {
    const res = await send('preview', [`${PREFIX} Sales`, `${PREFIX} sales`, TOO_LONG, `${PREFIX} Ops`]);
    expect(res.status).toBe(200);
    const rows = res.body.issues.map((i: { rowNumber: number }) => i.rowNumber).sort();
    expect(rows).toEqual([2, 3, 4]);
    expect(await prisma.department.count({ where: { name: { startsWith: PREFIX, mode: 'insensitive' } } })).toBe(0);
  });

  it('flags a name already in the system, regardless of case', async () => {
    await prisma.department.create({ data: { name: `${PREFIX} Finance` } });
    const res = await send('preview', [`${PREFIX} FINANCE`]);
    expect(res.body.issues).toEqual([expect.objectContaining({ rowNumber: 2, column: 'name' })]);
  });

  it('refuses a file over the row limit with 400', async () => {
    const names = Array.from({ length: 2001 }, (_, i) => `${PREFIX} D${i}`);
    expect((await send('preview', names)).status).toBe(400);
  });

  it('commits nothing when any row has an error, and reports every issue', async () => {
    const res = await send('commit', [`${PREFIX} Good`, TOO_LONG]);
    expect(res.status).toBe(400);
    expect(res.body.issues).toHaveLength(1);
    expect(await prisma.department.count({ where: { name: { startsWith: PREFIX, mode: 'insensitive' } } })).toBe(0);
  });

  it('commits a clean file in one go with an IMPORT audit row per department', async () => {
    const res = await send('commit', [`${PREFIX} One`, `${PREFIX} Two`]);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ created: 2 });
    const depts = await prisma.department.findMany({ where: { name: { startsWith: PREFIX } } });
    expect(depts).toHaveLength(2);
    expect(
      await prisma.auditLog.count({ where: { entity: 'DEPARTMENT', action: 'IMPORT', entityId: { in: depts.map((d) => d.id) } } }),
    ).toBe(2);
  });

  it('asks for a file when none is sent', async () => {
    const res = await request(app).post('/api/departments/import/preview').set(importer);
    expect(res.status).toBe(400);
  });
});
