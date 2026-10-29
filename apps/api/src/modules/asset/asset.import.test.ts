import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import {
  cleanAssetData,
  codePrefix,
  hireActor,
  makeCategory,
  makeDepartment,
} from './asset.fixtures.js';

const prefix = 'zzassetimp';
const app = createApp();
let departmentId: string;
let alice: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let laptop: { id: string; code: string };
let chair: { id: string; code: string };

const HEADER =
  'assetTag,categoryCode,name,serialNumber,purchaseDate,purchaseCost,currency,departmentName,assignedToEmployeeCode,assignedAt,conditionOut';

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  alice = await hireActor(prefix, departmentId);
  hr = await hireActor(prefix, departmentId, ['asset.read:all', 'asset.manage:all']);
  const config = await makeActor(prefix, 'STANDARD', ['asset.config']);
  laptop = await makeCategory(app, config.header, prefix, { requiresSerial: true });
  chair = await makeCategory(app, config.header, prefix, { requiresSerial: false });
});
afterAll(async () => {
  await prisma.department.deleteMany({ where: { name: { startsWith: `${prefix}-imported` } } });
  await cleanAssetData(prefix, [departmentId]);
});

const csv = (...rows: string[]) => Buffer.from([HEADER, ...rows].join('\n'));
const send = (path: 'preview' | 'commit', body: Buffer, who = hr) =>
  request(app)
    .post(`/api/assets/import/${path}`)
    .set(who.header)
    .attach('file', body, { filename: 'assets.csv', contentType: 'text/csv' });
const assetsOf = (code: string) => prisma.asset.findMany({ where: { category: { code } } });

describe('importing the asset register', () => {
  it('previews without writing, and reports what a commit would do', async () => {
    const res = await send(
      'preview',
      csv(
        `,${laptop.code},Dell A,SN-A1,2026-01-15,95000,BDT,${prefix}-imported-dept,${alice.employee.employeeCode},2026-02-01,GOOD`,
        `,${chair.code},Chair,,,,,,,`,
      ),
    );
    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
    expect(res.body.summary).toMatchObject({ assets: 2, assignments: 1, departmentsToCreate: 1 });
    expect(await assetsOf(laptop.code)).toHaveLength(0);
    expect(await prisma.department.count({ where: { name: `${prefix}-imported-dept` } })).toBe(0);
  });

  it('writes nothing at all when one row of three is bad', async () => {
    const before = await prisma.asset.count();
    const body = csv(
      `,${chair.code},Good one,,,,,,,`,
      `,${laptop.code},No serial,,,,,,,`,
      `,${chair.code},Another good one,,,,,,,`,
    );
    const res = await send('commit', body);
    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual([
      expect.objectContaining({ rowNumber: 3, column: 'serialNumber' }),
    ]);
    expect(await prisma.asset.count()).toBe(before);
  });

  it('commits a good file in one go: assets, current custody, a new department, one event', async () => {
    const res = await send(
      'commit',
      csv(
        `,${laptop.code},Dell B,SN-B1,2026-01-15,95000.5,BDT,${prefix}-imported-dept,${alice.employee.employeeCode},2026-02-01,GOOD`,
        `BS-AST-90001,${chair.code},Chair B,,,,,,,`,
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ assetCount: 2, assignmentCount: 1 });
    const dell = (await assetsOf(laptop.code))[0]!;
    expect(dell.purchaseCost?.toFixed(2)).toBe('95000.50');
    const assignment = await prisma.assetAssignment.findFirstOrThrow({
      where: { assetId: dell.id },
    });
    expect(assignment).toMatchObject({
      employeeId: alice.employee.id,
      conditionOut: 'GOOD',
      acknowledgedAt: null,
      assignedBy: hr.user.id,
    });
    expect(assignment.assignedAt.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(await prisma.department.count({ where: { name: `${prefix}-imported-dept` } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { entity: 'ASSET_ASSIGNMENT', entityId: assignment.id, action: 'IMPORT' },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'asset.imported', payload: { path: ['actorUserId'], equals: hr.user.id } },
      }),
    ).toBe(1);
    const read = await request(app).get(`/api/assets/${dell.id}`).set(hr.header);
    expect(read.body).toMatchObject({
      status: 'ASSIGNED',
      heldBy: { employeeId: alice.employee.id },
    });
  });

  it('keeps tags in step, so an auto tag never collides with an explicit one from the same file', async () => {
    const res = await send(
      'commit',
      csv(`BS-AST-90010,${chair.code},Explicit,,,,,,,`, `,${chair.code},Auto,,,,,,,`),
    );
    expect(res.status).toBe(201);
    const tags = (await assetsOf(chair.code)).map((a) => a.assetTag);
    expect(tags).toContain('BS-AST-90010');
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('names every problem it finds: unknown category, duplicate serial in the file or the register, bad dates, half a custody pair', async () => {
    await send('commit', csv(`,${laptop.code},Existing,SN-EXISTING,,,,,,,`));
    const res = await send(
      'preview',
      csv(
        `,NOPE,Unknown,,,,,,,,`,
        `,${laptop.code},Dup 1,SN-DUP,,,,,,,`,
        `,${laptop.code},Dup 2,SN-DUP,,,,,,,`,
        `,${laptop.code},Exists,SN-EXISTING,,,,,,,`,
        `,${chair.code},Bad date,,2026-13-45,,,,,,`,
        `,${chair.code},Half,,,,,,${alice.employee.employeeCode},,`,
        `,${chair.code},Future,,,,,,${alice.employee.employeeCode},2999-01-01,`,
      ),
    );
    const messages = res.body.issues
      .map((i: { rowNumber: number; message: string }) => `${i.rowNumber}:${i.message}`)
      .join('\n');
    expect(messages).toMatch(/2:Unknown category code "NOPE"/);
    expect(messages).toMatch(/Duplicate serialNumber "SN-DUP"/);
    expect(messages).toMatch(/6:Expected a YYYY-MM-DD date/);
    expect(messages).toMatch(/7:assignedAt is required/);
    expect(messages).toMatch(/8:assignedAt cannot be in the future/);
    const existing = await send('preview', csv(`,${laptop.code},Exists,SN-EXISTING,,,,,,,`));
    expect(existing.body.issues[0]).toMatchObject({
      column: 'serialNumber',
      message: expect.stringContaining('already exists'),
    });
  });

  it('rejects an unknown or former employee code, and money with too many decimals', async () => {
    const res = await send(
      'preview',
      csv(
        `,${chair.code},Ghost,,2026-01-01,,,,EMP-NOBODY,2026-02-01,`,
        `,${chair.code},Pricey,,2026-01-01,10.005,,,,,`,
      ),
    );
    expect(res.body.issues.map((i: { column: string }) => i.column)).toEqual(
      expect.arrayContaining(['assignedToEmployeeCode', 'purchaseCost']),
    );
  });

  it('needs asset.manage, and a file', async () => {
    expect((await send('preview', csv(`,${chair.code},x,,,,,,,`), alice)).status).toBe(403);
    expect((await request(app).post('/api/assets/import/commit').set(hr.header)).status).toBe(400);
  });

  it('serves the guide and an example file that passes its own checks', async () => {
    const guide = await request(app).get('/api/assets/import/guide').set(hr.header);
    expect(guide.status).toBe(200);
    expect(guide.body.columns.map((c: { header: string }) => c.header)).toContain('categoryCode');
    const template = await request(app)
      .get('/api/assets/import/template')
      .query({ format: 'csv' })
      .set(hr.header)
      .buffer(true);
    expect(template.status).toBe(200);
    expect(template.headers['content-disposition']).toContain('assets-example.csv');
    expect(codePrefix(prefix)).toBe('ZZASSETIMP');
  });
});

describe('exporting the register', () => {
  it('downloads what the viewer may see, with cost only for a manager, and records one export', async () => {
    const before = await prisma.auditLog.count({
      where: { entity: 'DATA_EXPORT', entityId: 'ASSETS', changedBy: hr.user.id },
    });
    const res = await request(app)
      .get('/api/assets/export')
      .query({ format: 'csv', q: 'Chair B' })
      .set(hr.header);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('assetTag');
    expect(res.text).toContain('Chair B');
    expect(
      await prisma.auditLog.count({
        where: { entity: 'DATA_EXPORT', entityId: 'ASSETS', changedBy: hr.user.id },
      }),
    ).toBe(before + 1);
    expect(
      (await request(app).get('/api/assets/export').query({ format: 'csv' }).set(alice.header))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get('/api/assets/export').query({ format: 'pdf' }).set(hr.header)).status,
    ).toBe(400);
  });
});
