import request from 'supertest';
import type { Express } from 'express';
import { prisma } from '@erp/db';
import { cleanActors } from '../../test-utils/access.js';

export { daysAgo, hireActor, makeDepartment } from '../../test-utils/people.js';

/** The upper-case form a category code must take, so one prefix names everything a test file made. */
export const codePrefix = (prefix: string) => prefix.toUpperCase();

let seq = 0;

/** A category made through the API, as an administrator would. */
export async function makeCategory(
  app: Express,
  header: Record<string, string>,
  prefix: string,
  over: Record<string, unknown> = {},
) {
  const n = seq++;
  const res = await request(app)
    .post('/api/assets/categories')
    .set(header)
    .send({
      code: `${codePrefix(prefix)}_C${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[n % 26]}${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(n / 26) % 26]}`,
      name: `${prefix} category ${Date.now()}-${n}`,
      classification: 'IT',
      requiresSerial: false,
      ...over,
    });
  if (res.status !== 201) throw new Error(`category: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; code: string; name: string };
}

/** An asset made through the API. */
export async function makeAsset(
  app: Express,
  header: Record<string, string>,
  categoryId: string,
  over: Record<string, unknown> = {},
) {
  const res = await request(app)
    .post('/api/assets')
    .set(header)
    .send({ categoryId, name: `Asset ${Date.now()}-${seq++}`, ...over });
  if (res.status !== 201) throw new Error(`asset: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; assetTag: string };
}

/** Removes what a test file made under `prefix`: assets and everything hanging off them, people, departments and actors. */
export async function cleanAssetData(prefix: string, departmentIds: string[]) {
  const users = (
    await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } })
  ).map((u) => u.id);
  const people = (
    await prisma.employee.findMany({
      where: { OR: [{ departmentId: { in: departmentIds } }, { userId: { in: users } }] },
      select: { id: true },
    })
  ).map((p) => p.id);
  const categoryIds = (
    await prisma.assetCategory.findMany({
      where: { code: { startsWith: codePrefix(prefix) } },
      select: { id: true },
    })
  ).map((c) => c.id);
  const assetIds = (
    await prisma.asset.findMany({
      where: { OR: [{ categoryId: { in: categoryIds } }, { departmentId: { in: departmentIds } }] },
      select: { id: true },
    })
  ).map((a) => a.id);
  const requestIds = (
    await prisma.assetRequest.findMany({
      where: {
        OR: [
          { employeeId: { in: people } },
          { assetId: { in: assetIds } },
          { categoryId: { in: categoryIds } },
        ],
      },
      select: { id: true },
    })
  ).map((r) => r.id);
  await prisma.outboxEvent.deleteMany({
    where: { OR: users.map((id) => ({ payload: { path: ['actorUserId'], equals: id } })) },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { changedBy: { in: users } },
        { entityId: { in: [...assetIds, ...requestIds, ...categoryIds] } },
      ],
    },
  });
  await prisma.notification.deleteMany({
    where: { OR: [{ userId: { in: users } }, { entityId: { in: requestIds } }] },
  });
  await prisma.assetRecovery.deleteMany({
    where: { OR: [{ assetId: { in: assetIds } }, { employeeId: { in: people } }] },
  });
  await prisma.assetAttachment.deleteMany({
    where: { OR: [{ assetId: { in: assetIds } }, { assignment: { assetId: { in: assetIds } } }] },
  });
  await prisma.assetRequest.deleteMany({ where: { id: { in: requestIds } } });
  await prisma.assetRepair.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.assetAssignment.deleteMany({
    where: { OR: [{ assetId: { in: assetIds } }, { employeeId: { in: people } }] },
  });
  await prisma.assetDepreciation.deleteMany({ where: { assetId: { in: assetIds } } });
  await prisma.asset.deleteMany({ where: { id: { in: assetIds } } });
  await prisma.assetCategory.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.employee.updateMany({
    where: { id: { in: people } },
    data: { reportingManagerId: null },
  });
  await prisma.employee.deleteMany({ where: { id: { in: people } } });
  await prisma.department.deleteMany({
    where: { OR: [{ id: { in: departmentIds } }, { name: { startsWith: prefix } }] },
  });
  await cleanActors(prefix);
}
