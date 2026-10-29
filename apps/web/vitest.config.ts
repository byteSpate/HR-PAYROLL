import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The same '@/' alias as tsconfig, so copied screens that import through it load under test.
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  // tsconfig keeps jsx as "preserve" for Next, so tests need the transform set explicitly.
  oxc: { jsx: { runtime: 'automatic' } },
  test: { include: ['**/*.test.{ts,tsx}'], exclude: ['node_modules/**', '.next/**'], environment: 'node' },
});
