// Shared flat ESLint config for every workspace package.
// Packages import this from their eslint.config.js and append their own rules.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import moduleDeps from './rules/module-deps.js';

// Apps enable it with: plugins: { erp }, rules: { 'erp/module-deps': ['error', { modules }] }
export const erp = { rules: { 'module-deps': moduleDeps } };

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
