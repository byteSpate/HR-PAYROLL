import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// The tests hit the isolated test database, so they reuse packages/db/.env rather than keeping a second copy.
config({ path: fileURLToPath(new URL('../db/.env', import.meta.url)) });
process.env['DATABASE_URL'] = process.env['DATABASE_URL_TEST'] ?? '';

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
