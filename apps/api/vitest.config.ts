import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Tests use the isolated test database: load its URL from packages/db/.env (not committed).
config({ path: '../../packages/db/.env', quiet: true });
process.env['DATABASE_URL'] = process.env['DATABASE_URL_TEST'] ?? '';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: {
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789',
    },
  },
});
