import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  // A directory, so every .prisma file in it is one schema (multi-file).
  schema: 'prisma/schema',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: process.env['DATABASE_URL'] },
});
