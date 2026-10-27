import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// dotenv loads packages/db/.env so tests reach the dev database without exporting it.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
