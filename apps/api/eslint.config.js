import base, { erp } from '@erp/config-eslint';
import { modules } from '@erp/contracts';

// Folders under src/modules that belong to a manifest module (the rule otherwise maps folder name = module name).
const folders = { core: ['auth', 'users'] };

export default [
  ...base,
  {
    plugins: { erp },
    rules: {
      'erp/module-deps': [
        'error',
        { modules: modules.map(({ name, deps }) => ({ name, deps: [...deps], folders: folders[name] ?? [name] })) },
      ],
    },
  },
];
