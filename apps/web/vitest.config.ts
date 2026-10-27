import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig keeps jsx as "preserve" for Next, so tests need the transform set explicitly.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['**/*.test.{ts,tsx}'], exclude: ['node_modules/**', '.next/**'], environment: 'node' },
});
