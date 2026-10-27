import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import rule from './module-deps.js';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const options = [{ modules: [{ name: 'a', deps: [] }, { name: 'b', deps: ['a'] }, { name: 'c', deps: [] }] }];
const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } });

const api = (m, f = 'x.ts') => `/repo/apps/api/src/modules/${m}/${f}`;
const web = (m, f = 'x.ts') => `/repo/apps/web/modules/${m}/${f}`;

tester.run('module-deps', rule, {
  valid: [
    { code: "import x from '../a/a.service'", filename: api('b'), options },
    { code: "import x from '../../modules/a/a.service'", filename: api('b'), options },
    { code: "import x from './local'", filename: api('c'), options },
    { code: "import x from '../c/other'", filename: api('c', 'sub/y.ts'), options },
    { code: "import x from '@erp/contracts'", filename: api('c'), options },
    { code: "import x from 'zod'", filename: api('c'), options },
    { code: "import x from '../a/a.service'", filename: '/repo/apps/api/src/main.ts', options },
    { code: "import x from '../a/a.component'", filename: web('b'), options },
  ],
  invalid: [
    {
      code: "import x from '../a/a.service'",
      filename: api('c'),
      options,
      errors: [{ message: "module 'c' imports 'a' which is not in its deps" }],
    },
    {
      code: "export * from '../a/a.service'",
      filename: api('c'),
      options,
      errors: [{ message: "module 'c' imports 'a' which is not in its deps" }],
    },
    {
      code: "import x from '../a/a.component'",
      filename: web('c'),
      options,
      errors: [{ message: "module 'c' imports 'a' which is not in its deps" }],
    },
  ],
});
