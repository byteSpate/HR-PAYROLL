import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// dotenv loads packages/db/.env; tests then run against the isolated test database, never the dev one.
process.env['DATABASE_URL'] = process.env['DATABASE_URL_TEST'] ?? '';

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
