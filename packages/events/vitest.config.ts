import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// The tests hit the dev database, so they reuse packages/db/.env rather than keeping a second copy.
config({ path: fileURLToPath(new URL('../db/.env', import.meta.url)) });

export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
