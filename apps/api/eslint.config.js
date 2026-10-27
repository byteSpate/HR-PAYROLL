import base, { erp } from '@erp/config-eslint';
import { modules } from '@erp/contracts';

export default [
  ...base,
  {
    plugins: { erp },
    rules: { 'erp/module-deps': ['error', { modules: modules.map(({ name, deps }) => ({ name, deps: [...deps] })) }] },
  },
];
