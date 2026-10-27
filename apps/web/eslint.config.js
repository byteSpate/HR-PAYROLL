import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import { erp } from '@erp/config-eslint';
import { modules } from '@erp/contracts';

// The settings UI (users, roles) lives in modules/settings and belongs to the core manifest module.
const folders = { core: ['settings'] };

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'next-env.d.ts']),
  {
    plugins: { erp },
    rules: {
      'erp/module-deps': [
        'error',
        { modules: modules.map(({ name, deps }) => ({ name, deps: [...deps], folders: folders[name] ?? [name] })) },
      ],
    },
  },
]);
