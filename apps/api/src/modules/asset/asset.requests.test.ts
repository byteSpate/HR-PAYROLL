import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '@erp/db';
import { createApp } from '../../app.js';
import { makeActor } from '../../test-utils/access.js';
import {
  cleanAssetData,
  hireActor,
  makeAsset,
  makeCategory,
  makeDepartment,
} from './asset.fixtures.js';

const prefix = 'zzassetreq';
const app = createApp();
let departmentId: string;
let otherDepartmentId: string;
let manager: Awaited<ReturnType<typeof hireActor>>;
let alice: Awaited<ReturnType<typeof hireActor>>;
let bob: Awaited<ReturnType<typeof hireActor>>;
let hr: Awaited<ReturnType<typeof hireActor>>;
let approver: Awaited<ReturnType<typeof hireActor>>;
let admin: Awaited<ReturnType<typeof hireActor>>;
let monitor: { id: string };
let paper: { id: string };

beforeAll(async () => {
  departmentId = (await makeDepartment(prefix)).id;
  otherDepartmentId = (await makeDepartment(prefix)).id;
  manager = await hireActor(prefix, departmentId, ['asset.approve:team']);
  alice = await hireActor(prefix, departmentId, [], { managerEmployeeId: manager.employee.id });
  bob = await hireActor(prefix, otherDepartmentId);
  hr = await hireActor(prefix, otherDepartmentId, ['asset.read:all', 'asset.manage:all']);
  approver = await hireActor(prefix, otherDepartmentId, ['asset.approve:all']);
  admin = await hireActor(prefix, otherDepartmentId, [], { admin: true });
  const config = await makeActor(prefix, 'STANDARD', ['asset.config']);
  monitor = await makeCategory(app, config.header, prefix);
  paper = await makeCategory(app, config.header, prefix, {
    tracksIndividually: false,
    requiresSerial: false,
  });
});
afterAll(async () => {
  await cleanAssetData(prefix, [departmentId, otherDepartmentId]);
});

type Who = { header: Record<string, string> };
const submit = (who: Who, body: object) =>
  request(app).post('/api/assets/requests').set(who.header).send(body);
const newItem = (who: Who, over: object = {}) =>
  submit(who, { kind: 'NEW_ITEM', categoryId: monitor.id, reason: 'My screen died', ...over });
const act = (verb: string, who: Who, id: string, body: object = {}) =>
  request(app).post(`/api/assets/requests/${id}/${verb}`).set(who.header).send(body);
const heldAsset = async (who: { employee: { id: string } }) => {
  const asset = await makeAsset(app, hr.header, monitor.id, { name: 'Held monitor' });
  await request(app)
    .post(`/api/assets/${asset.id}/assign`)
    .set(hr.header)
    .send({ employeeId: who.employee.id, conditionOut: 'GOOD' });
  return asset;
};

describe('submitting a request', () => {
  it('asks for a category, not a unit, and starts awaiting approval', async () => {
    const res = await newItem(alice);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'NEW_ITEM',
      status: 'PENDING',
      stage: 'AWAITING_APPROVAL',
      categoryId: monitor.id,
      employeeId: alice.employee.id,
    });
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: 'asset.request.submitted',
          payload: { path: ['requestId'], equals: res.body.id },
        },
      }),
    ).toBe(1);
  });

  it('needs an employee record, and a reason', async () => {
    expect((await newItem(await makeActor(prefix, 'ADMIN'))).status).toBe(403);
    expect((await newItem(alice, { reason: '' })).status).toBe(400);
  });

  it('keeps quantity for supplies, in both directions', async () => {
    expect((await newItem(alice, { categoryId: paper.id })).status).toBe(400);
    const supply = await newItem(alice, { categoryId: paper.id, quantity: 5 });
    expect(supply.status).toBe(201);
    expect(supply.body.quantity).toBe(5);
    expect((await newItem(alice, { quantity: 2 })).status).toBe(400);
  });

  it('lets you ask for a repair or a return only of what you hold, and 404s any other asset', async () => {
    const mine = await heldAsset(alice);
    const theirs = await heldAsset(bob);
    expect(
      (await submit(alice, { kind: 'REPAIR', assetId: theirs.id, reason: 'Broken' })).status,
    ).toBe(404);
    const repair = await submit(alice, { kind: 'REPAIR', assetId: mine.id, reason: 'Flickers' });
    expect(repair.status).toBe(201);
    const duplicate = await submit(alice, {
      kind: 'REPAIR',
      assetId: mine.id,
      reason: 'Flickers again',
    });
    expect(duplicate.status).toBe(409);
    expect(
      (await submit(alice, { kind: 'RETURN', assetId: mine.id, reason: 'Leaving' })).status,
    ).toBe(201);
  });
});

describe('who sees which requests', () => {
  it('shows a person their own, a team approver their team’s, and an approver of everything all of them', async () => {
    const hers = (await newItem(alice, { reason: 'Alice’s' })).body;
    const his = (await newItem(bob, { reason: 'Bob’s' })).body;
    const idsFor = async (who: Who) =>
      (await request(app).get('/api/assets/requests').set(who.header)).body.map(
        (r: { id: string }) => r.id,
      );
    expect(await idsFor(alice)).toContain(hers.id);
    expect(await idsFor(alice)).not.toContain(his.id);
    expect(await idsFor(manager)).toContain(hers.id);
    expect(await idsFor(manager)).not.toContain(his.id);
    expect(await idsFor(approver)).toEqual(expect.arrayContaining([hers.id, his.id]));
    expect(await idsFor(hr)).toEqual(expect.arrayContaining([hers.id, his.id]));
  });
});

describe('deciding a request', () => {
  it('needs asset.approve within reach, and a non-admin cannot decide their own', async () => {
    const hers = (await newItem(alice)).body;
    expect((await act('approve', alice, hers.id)).status).toBe(403);
    expect((await act('approve', bob, hers.id)).status).toBe(403);
    expect((await act('approve', hr, hers.id)).status).toBe(403);
    const ownApprover = await hireActor(prefix, departmentId, ['asset.approve:all']);
    const own = (await newItem(ownApprover)).body;
    expect((await act('approve', ownApprover, own.id)).status).toBe(403);
    const selfByAdmin = (await newItem(admin)).body;
    expect((await act('approve', admin, selfByAdmin.id)).status).toBe(200);
  });

  it('approves once, stamps the decision, tells the requester and emits asset.request.approved', async () => {
    const hers = (await newItem(alice)).body;
    const res = await act('approve', manager, hers.id, { note: 'Go ahead' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'APPROVED',
      stage: 'APPROVED',
      decidedBy: manager.user.id,
      decisionNote: 'Go ahead',
    });
    expect((await act('approve', manager, hers.id)).status).toBe(409);
    expect((await act('reject', manager, hers.id, { note: 'Too late' })).status).toBe(409);
    expect(
      await prisma.notification.count({
        where: { userId: alice.user.id, entity: 'ASSET_REQUEST', entityId: hers.id },
      }),
    ).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          type: 'asset.request.approved',
          payload: { path: ['requestId'], equals: hers.id },
        },
      }),
    ).toBe(1);
  });

  it('refuses a request outside a team approver’s reach, and rejects only with a note', async () => {
    const his = (await newItem(bob)).body;
    expect((await act('approve', manager, his.id)).status).toBe(403);
    expect((await act('reject', approver, his.id, {})).status).toBe(400);
    const res = await act('reject', approver, his.id, { note: 'Not budgeted' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'REJECTED',
      stage: 'REJECTED',
      decisionNote: 'Not budgeted',
    });
    expect(
      await prisma.outboxEvent.count({
        where: { type: 'asset.request.rejected', payload: { path: ['requestId'], equals: his.id } },
      }),
    ).toBe(1);
  });

  it('turns an approved repair request into the repair itself, carrying the fault', async () => {
    const mine = await heldAsset(alice);
    const req = (await submit(alice, { kind: 'REPAIR', assetId: mine.id, reason: 'Keys stick' }))
      .body;
    const res = await act('approve', approver, req.id);
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('IN_REPAIR');
    const repair = await prisma.assetRepair.findFirstOrThrow({
      where: { assetId: mine.id, returnedAt: null },
    });
    expect(repair.fault).toBe('Keys stick');
    expect((await prisma.assetRequest.findUniqueOrThrow({ where: { id: req.id } })).repairId).toBe(
      repair.id,
    );
    expect((await request(app).get(`/api/assets/${mine.id}`).set(hr.header)).body.status).toBe(
      'IN_REPAIR',
    );
  });

  it('refuses to approve a repair while the asset already has an open repair, leaving the request pending', async () => {
    const mine = await heldAsset(alice);
    const req = (await submit(alice, { kind: 'REPAIR', assetId: mine.id, reason: 'Screen' })).body;
    await request(app)
      .post(`/api/assets/${mine.id}/repairs`)
      .set(hr.header)
      .send({ fault: 'Already out' });
    expect((await act('approve', approver, req.id)).status).toBe(409);
    expect((await prisma.assetRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe(
      'PENDING',
    );
  });
});

describe('withdrawing a request', () => {
  it('lets the requester withdraw their own while pending, and nobody else’s', async () => {
    const hers = (await newItem(alice)).body;
    expect((await act('cancel', bob, hers.id)).status).toBe(403);
    const res = await act('cancel', alice, hers.id);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect((await act('cancel', alice, hers.id)).status).toBe(409);
  });

  it('lets a manager of assets close someone else’s live request, but only with a reason', async () => {
    const hers = (await newItem(alice)).body;
    await act('approve', approver, hers.id);
    expect((await act('cancel', hr, hers.id)).status).toBe(400);
    const res = await act('cancel', hr, hers.id, { note: 'Discontinued, could not source it' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'CANCELLED',
      decisionNote: 'Discontinued, could not source it',
    });
    expect((await act('cancel', alice, hers.id)).status).toBe(409);
  });

  it('will not let the requester withdraw once it is approved', async () => {
    const hers = (await newItem(alice)).body;
    await act('approve', approver, hers.id);
    expect((await act('cancel', alice, hers.id)).status).toBe(409);
  });
});

describe('ordering and fulfilling', () => {
  it('marks an approved new-item request ordered, and nothing else', async () => {
    const hers = (await newItem(alice)).body;
    expect((await act('order', hr, hers.id, {})).status).toBe(409);
    await act('approve', approver, hers.id);
    expect((await act('order', alice, hers.id, {})).status).toBe(403);
    const res = await act('order', hr, hers.id, {
      expectedBy: '2026-12-01',
      note: 'Ordered from Star Tech',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ORDERED',
      stage: 'ORDERED',
      expectedBy: '2026-12-01',
      orderNote: 'Ordered from Star Tech',
    });
    const repairReq = (
      await submit(alice, {
        kind: 'RETURN',
        assetId: (await heldAsset(alice)).id,
        reason: 'Leaving',
      })
    ).body;
    await act('approve', approver, repairReq.id);
    expect((await act('order', hr, repairReq.id, {})).status).toBe(409);
  });

  it('hands over the chosen asset and completes the request together, emitting one asset.assigned', async () => {
    const hers = (await newItem(alice)).body;
    await act('approve', approver, hers.id);
    const spare = await makeAsset(app, hr.header, monitor.id, { name: 'Spare monitor' });
    expect((await act('fulfil', hr, hers.id, {})).status).toBe(400);
    const res = await act('fulfil', hr, hers.id, { assetId: spare.id, note: 'From the store' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'FULFILLED',
      stage: 'DONE',
      fulfilledAssetId: spare.id,
    });
    const read = await request(app).get(`/api/assets/${spare.id}`).set(hr.header);
    expect(read.body).toMatchObject({
      status: 'ASSIGNED',
      heldBy: { employeeId: alice.employee.id },
    });
    const events = await prisma.outboxEvent.findMany({
      where: { type: 'asset.assigned', payload: { path: ['assetId'], equals: spare.id } },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.payload).toMatchObject({ requestId: hers.id });
  });

  it('leaves the request approved when the chosen asset cannot be handed over', async () => {
    const hers = (await newItem(alice)).body;
    await act('approve', approver, hers.id);
    const taken = await heldAsset(bob);
    const res = await act('fulfil', hr, hers.id, { assetId: taken.id });
    expect(res.status).toBe(409);
    expect((await prisma.assetRequest.findUniqueOrThrow({ where: { id: hers.id } })).status).toBe(
      'APPROVED',
    );
  });

  it('fulfils a supply with no asset, and a request that was ordered', async () => {
    const supply = (await newItem(alice, { categoryId: paper.id, quantity: 3 })).body;
    await act('approve', approver, supply.id);
    expect((await act('fulfil', hr, supply.id, { note: 'Three reams' })).body).toMatchObject({
      status: 'FULFILLED',
      fulfilledAssetId: null,
    });
    const ordered = (await newItem(alice)).body;
    await act('approve', approver, ordered.id);
    await act('order', hr, ordered.id, {});
    const spare = await makeAsset(app, hr.header, monitor.id);
    expect((await act('fulfil', hr, ordered.id, { assetId: spare.id })).status).toBe(200);
  });

  it('will not fulfil a repair or return request that way, or one nobody approved', async () => {
    const pending = (await newItem(alice)).body;
    const spare = await makeAsset(app, hr.header, monitor.id);
    expect((await act('fulfil', hr, pending.id, { assetId: spare.id })).status).toBe(409);
    const ret = (
      await submit(alice, {
        kind: 'RETURN',
        assetId: (await heldAsset(alice)).id,
        reason: 'Leaving',
      })
    ).body;
    await act('approve', approver, ret.id);
    expect((await act('fulfil', hr, ret.id, { assetId: spare.id })).status).toBe(409);
  });

  it('completes an approved return when the asset is taken back', async () => {
    const mine = await heldAsset(alice);
    const ret = (await submit(alice, { kind: 'RETURN', assetId: mine.id, reason: 'Leaving' })).body;
    await act('approve', approver, ret.id);
    expect(
      (await request(app).get('/api/assets/requests').set(alice.header)).body.find(
        (r: { id: string }) => r.id === ret.id,
      ).stage,
    ).toBe('AWAITING_COLLECTION');
    await request(app)
      .post(`/api/assets/${mine.id}/return`)
      .set(hr.header)
      .send({ conditionIn: 'GOOD' });
    expect((await prisma.assetRequest.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe(
      'FULFILLED',
    );
  });
});

describe('a request’s timeline', () => {
  it('reads back each step with who took it and the note they left, and 404s a request you cannot see', async () => {
    const hers = (await newItem(alice)).body;
    await act('approve', approver, hers.id, { note: 'Fine' });
    const line = await request(app)
      .get(`/api/assets/requests/${hers.id}/timeline`)
      .set(alice.header);
    expect(line.status).toBe(200);
    expect(line.body.map((e: { action: string }) => e.action)).toEqual(['SUBMIT', 'APPROVE']);
    expect(line.body[1]).toMatchObject({ byUserId: approver.user.id, note: 'Fine' });
    expect(
      (await request(app).get(`/api/assets/requests/${hers.id}/timeline`).set(bob.header)).status,
    ).toBe(404);
  });
});
