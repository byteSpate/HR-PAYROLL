import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const testUrl = process.env['DATABASE_URL_TEST'];
if (!testUrl) throw new Error('DATABASE_URL_TEST is not set');
const parsed = new URL(testUrl);
const dbName = decodeURIComponent(parsed.pathname.slice(1));
if (!/^[A-Za-z0-9_]+$/.test(dbName) || dbName === 'erp') {
  throw new Error(`Refusing to prepare "${dbName}" as the test database`);
}

// An existing dev volume skips the compose init SQL, so create the database here when missing.
async function ensureDatabase(): Promise<void> {
  const admin = new URL(testUrl as string);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (found.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`created database ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

await ensureDatabase();

// Point everything below (prisma CLI, the client module) at the test database only.
process.env['DATABASE_URL'] = testUrl;
const deploy = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { stdio: 'inherit', env: process.env });
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

// Dynamic imports: the client reads DATABASE_URL when first loaded.
const { prisma } = await import('../src/client.js');
const { allPermissions } = await import('@erp/contracts');
const { syncPermissions } = await import('../src/seed/sync-permissions.js');
const { seedRoles } = await import('../src/seed/seed-roles.js');
const { grantNewPermissions } = await import('../src/seed/grant-new-permissions.js');
const { STARTER_ROLES } = await import('../src/seed/starter-roles.js');
try {
  const { added } = await syncPermissions(prisma, allPermissions());
  await seedRoles(prisma);
  await grantNewPermissions(prisma, added, STARTER_ROLES);
  console.log(`${dbName} ready (no users)`);
} finally {
  await prisma.$disconnect();
}
