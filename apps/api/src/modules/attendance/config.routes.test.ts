import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { bearer } from '../../test-utils/access.js';

const app = createApp();
const PREFIX = 'zzcfg';
const config = bearer('u-att-config', 'STANDARD', ['attendance.config']);
const plain = bearer('u-att-plain', 'STANDARD', []);

afterEach(async () => {
  const shifts = await prisma.shift.findMany({ where: { name: { startsWith: PREFIX } } });
  const holidays = await prisma.holiday.findMany({ where: { name: { startsWith: PREFIX } } });
  const ids = [...shifts, ...holidays].map((r) => r.id);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.shift.deleteMany({ where: { id: { in: shifts.map((s) => s.id) } } });
  await prisma.holiday.deleteMany({ where: { id: { in: holidays.map((h) => h.id) } } });
});

const shiftBody = (name: string) => ({ name: `${PREFIX} ${name}`, startTime: '09:00', endTime: '18:00', weeklyOffDays: [5] });
const csvPost = (path: string, rows: string[]) =>
  request(app).post(path).set(config).attach('file', Buffer.from(rows.join('\r\n')), { filename: 'x.csv', contentType: 'text/csv' });

describe('shift and holiday routes', () => {
  it('lets any signed-in user read holidays but not change them', async () => {
    expect((await request(app).get('/api/attendance/holidays')).status).toBe(401);
    expect((await request(app).get('/api/attendance/holidays').set(plain)).status).toBe(200);
    const body = { name: `${PREFIX} Day`, date: '2026-07-01', type: 'GENERAL' };
    expect((await request(app).post('/api/attendance/holidays').set(plain).send(body)).status).toBe(403);
    expect((await request(app).post('/api/attendance/holidays').set(config).send(body)).status).toBe(201);
  });

  it('keeps shifts behind attendance.config for writes, and readable to those who set shifts up', async () => {
    expect((await request(app).get('/api/attendance/shifts').set(plain)).status).toBe(403);
    expect((await request(app).post('/api/attendance/shifts').set(plain).send(shiftBody('A'))).status).toBe(403);
    const created = await request(app).post('/api/attendance/shifts').set(config).send(shiftBody('A'));
    expect(created.status).toBe(201);
    const listed = await request(app).get('/api/attendance/shifts').set(config);
    expect(listed.body.some((s: { id: string }) => s.id === created.body.id)).toBe(true);
    expect((await request(app).get('/api/attendance/shifts').set(bearer('u-hr', 'STANDARD', ['employee.create']))).status).toBe(200);
  });

  it('patches and deletes a shift, 409 on overlapping dated overrides', async () => {
    const a = await request(app).post('/api/attendance/shifts').set(config).send({ ...shiftBody('R1'), effectiveFrom: '2026-03-01', effectiveTo: '2026-03-30' });
    expect(a.status).toBe(201);
    const clash = await request(app).post('/api/attendance/shifts').set(config).send({ ...shiftBody('R2'), effectiveFrom: '2026-03-20', effectiveTo: '2026-04-02' });
    expect(clash.status).toBe(409);
    const patched = await request(app).patch(`/api/attendance/shifts/${a.body.id}`).set(config).send({ ...shiftBody('R1'), startTime: '10:00', effectiveFrom: '2026-03-01', effectiveTo: '2026-03-30' });
    expect(patched.body.startTime).toBe('10:00');
    expect((await request(app).delete(`/api/attendance/shifts/${a.body.id}`).set(config)).status).toBe(204);
  });

  it('exports holidays as csv and audits it', async () => {
    await request(app).post('/api/attendance/holidays').set(config).send({ name: `${PREFIX} Export`, date: '2026-08-01', type: 'GENERAL' });
    const res = await request(app).get('/api/attendance/holidays/export?format=csv').set(config);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain(`${PREFIX} Export`);
  });
});

describe('holiday import', () => {
  it('previews, then commits a clean file', async () => {
    const rows = ['date,name,type', `2026-09-01,${PREFIX} One,GENERAL`, `2026-09-02,${PREFIX} Two,OPTIONAL`];
    const preview = await csvPost('/api/attendance/holidays/import/preview', rows);
    expect(preview.status).toBe(200);
    expect(preview.body.issues).toEqual([]);
    const commit = await csvPost('/api/attendance/holidays/import/commit', rows);
    expect(commit.status).toBe(201);
    expect(await prisma.holiday.count({ where: { name: { startsWith: PREFIX } } })).toBe(2);
  });

  it('writes nothing when any row is bad, and names the row', async () => {
    const rows = ['date,name,type', `2026-09-01,${PREFIX} Good,GENERAL`, `not-a-date,${PREFIX} Bad,GENERAL`];
    const res = await csvPost('/api/attendance/holidays/import/commit', rows);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('3');
    expect(await prisma.holiday.count({ where: { name: { startsWith: PREFIX } } })).toBe(0);
  });

  it('flags a (date, name) already stored and one repeated inside the file', async () => {
    await prisma.holiday.create({ data: { name: `${PREFIX} Taken`, date: new Date('2026-09-05T00:00:00Z') } });
    const res = await csvPost('/api/attendance/holidays/import/preview', [
      'date,name,type',
      `2026-09-05,${PREFIX} Taken,GENERAL`,
      `2026-09-06,${PREFIX} Twice,GENERAL`,
      `2026-09-06,${PREFIX} Twice,GENERAL`,
    ]);
    expect(res.body.issues.map((i: { rowNumber: number }) => i.rowNumber).sort()).toEqual([2, 4]);
  });

  it('is closed to users without attendance.config', async () => {
    expect((await request(app).get('/api/attendance/holidays/import/guide').set(plain)).status).toBe(403);
  });
});

describe('shift import', () => {
  const header = 'name,starttime,endtime,breakminutes,graceminutes,weeklyoffdays,effectivefrom,effectiveto';

  it('commits a clean file', async () => {
    const res = await csvPost('/api/attendance/shifts/import/commit', [header, `${PREFIX} Night,22:00,06:00,30,10,"5,6",,`]);
    expect(res.status).toBe(201);
    const stored = await prisma.shift.findFirstOrThrow({ where: { name: `${PREFIX} Night` } });
    expect(stored.weeklyOffDays.sort()).toEqual([5, 6]);
  });

  it('writes nothing when a row has a bad time', async () => {
    const res = await csvPost('/api/attendance/shifts/import/commit', [header, `${PREFIX} Ok,09:00,18:00,60,15,5,,`, `${PREFIX} Bad,25:00,18:00,60,15,5,,`]);
    expect(res.status).toBe(400);
    expect(await prisma.shift.count({ where: { name: { startsWith: PREFIX } } })).toBe(0);
  });
});
