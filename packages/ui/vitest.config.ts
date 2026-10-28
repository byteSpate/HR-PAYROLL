import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig keeps jsx as "preserve" for Next, so tests need the transform set explicitly.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
