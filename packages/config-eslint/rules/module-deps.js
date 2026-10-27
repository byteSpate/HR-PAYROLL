// Enforces that a module imports only modules listed in its manifest deps.
// The manifest list is passed as options (not imported) so config-eslint stays
// free of a dependency cycle with @erp/contracts.

import path from 'node:path';

const MODULE_DIR = /(?:^|\/)(?:apps\/api\/src|apps\/web)\/modules\/([^/]+)\//;

function moduleOf(filePath) {
  return MODULE_DIR.exec(filePath.split(path.sep).join('/'))?.[1] ?? null;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          modules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                deps: { type: 'array', items: { type: 'string' } },
                folders: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'deps'],
            },
          },
        },
        required: ['modules'],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // A module may span several folders (e.g. core = auth + users); unlisted folders map to themselves.
    const folderToModule = new Map();
    for (const m of context.options[0].modules) {
      for (const f of m.folders ?? [m.name]) folderToModule.set(f, m.name);
    }
    const moduleName = (filePath) => {
      const folder = moduleOf(filePath);
      return folder === null ? null : (folderToModule.get(folder) ?? folder);
    };
    const own = moduleName(context.filename);
    if (!own) return {};
    const manifest = context.options[0].modules.find((m) => m.name === own);
    const allowed = new Set(manifest?.deps ?? []);

    function check(node) {
      const source = node.source?.value;
      if (typeof source !== 'string' || !source.startsWith('.')) return;
      const target = moduleName(path.resolve(path.dirname(context.filename), source) + '/');
      if (!target || target === own || allowed.has(target)) return;
      context.report({
        node,
        message: `module '${own}' imports '${target}' which is not in its deps`,
      });
    }

    return {
      ImportDeclaration: check,
      ExportAllDeclaration: check,
      ExportNamedDeclaration: check,
    };
  },
};
