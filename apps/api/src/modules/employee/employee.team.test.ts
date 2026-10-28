import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { hashPassword } from '@erp/auth';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { cleanActors, makeActor } from '../../test-utils/access.js';
import { hire, removeEmployees } from './employee.fixtures.js';

const app = createApp();
const P = 'zztest10t';
let dep: string;
let hr: { Authorization: string };

beforeAll(async () => {
  await removeEmployees(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
  dep = (await prisma.department.create({ data: { name: `${P} Dept` } })).id;
  hr = (await makeActor(P, 'STANDARD', ['employee.create', 'employee.read:all', 'employee.update:all'])).header;
});
afterEach(() => removeEmployees(P));
afterAll(async () => {
  await cleanActors(P);
  await prisma.department.deleteMany({ where: { name: { startsWith: P } } });
});

// Logs the manager in for real, so the grants come from the server and not from a hand-made token.
async function login(userId: string) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword('correct-horse-9'), mustChangePassword: false },
  });
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: 'correct-horse-9' });
  expect(res.status).toBe(200);
  return { grants: res.body.user.grants as string[], header: { Authorization: `Bearer ${res.body.accessToken}` }, cookie: res.headers['set-cookie'] };
}

describe('manager team access', () => {
  it('grants team scope to a manager and lists their reports without personal details', async () => {
    const m = await hire(app, P, hr, dep);
    const r = await hire(app, P, hr, dep, { reportingManagerId: m.id });
    const session = await login(m.userId);
    expect(session.grants).toContain('employee.read:team');

    const team = await request(app).get('/api/employees/team').set(session.header);
    expect(team.status).toBe(200);
    expect(team.body.map((e: { id: string }) => e.id)).toEqual([r.id]);
    expect(team.body[0].employment).toBeDefined();
    expect(team.body[0].personal).toBeUndefined();
  });

  it('drops team access at the next refresh once the last report moves away', async () => {
    const m = await hire(app, P, hr, dep);
    const other = await hire(app, P, hr, dep);
    const r = await hire(app, P, hr, dep, { reportingManagerId: m.id });
    const session = await login(m.userId);

    await request(app).patch(`/api/employees/${r.id}`).set(hr).send({ reportingManagerId: other.id });
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', session.cookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.user.grants).not.toContain('employee.read:team');

    const team = await request(app).get('/api/employees/team').set({ Authorization: `Bearer ${refreshed.body.accessToken}` });
    expect(team.status).toBe(403);
  });

  it('ignores reports who have left', async () => {
    const m = await hire(app, P, hr, dep);
    const r = await hire(app, P, hr, dep, { reportingManagerId: m.id });
    await prisma.employee.update({ where: { id: r.id }, data: { employmentStatus: 'RESIGNED' } });
    expect((await login(m.userId)).grants).not.toContain('employee.read:team');
  });
});
