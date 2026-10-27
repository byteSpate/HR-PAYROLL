import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// sendExport writes an audit row, so the tests reuse packages/db/.env and the isolated test database.
config({ path: fileURLToPath(new URL('../db/.env', import.meta.url)) });
process.env['DATABASE_URL'] = process.env['DATABASE_URL_TEST'] ?? '';

export default defineConfig({ test: { include: ['src/**/*.test.ts'], fileParallelism: false } });
