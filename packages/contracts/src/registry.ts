import { core } from './core/manifest.js';
import { department } from './department/manifest.js';
import { employee } from './employee/manifest.js';
import type { ModuleManifest, Permission, PermissionDef, Scope } from './module.js';
import { notification } from './notification/manifest.js';

// Core first; later plans append their manifests here.
export const modules: readonly ModuleManifest[] = [core, department, employee, notification];

function findCycle(byName: Map<string, ModuleManifest>): string[] {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (name: string): string[] | null => {
    if (state.get(name) === 'done') return null;
    if (state.get(name) === 'visiting') return [...stack.slice(stack.indexOf(name)), name];
    state.set(name, 'visiting');
    stack.push(name);
    for (const dep of byName.get(name)?.deps ?? []) {
      const found = visit(dep);
      if (found) return found;
    }
    stack.pop();
    state.set(name, 'done');
    return null;
  };

  for (const name of byName.keys()) {
    const found = visit(name);
    if (found) return found;
  }
  return [];
}

/** Topological order (dependencies first) via Kahn's algorithm. */
export function resolveModuleOrder(ms: readonly ModuleManifest[]): ModuleManifest[] {
  const byName = new Map(ms.map((m) => [m.name, m]));
  const remaining = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const m of ms) {
    for (const dep of m.deps) {
      if (!byName.has(dep)) {
        throw new Error(`module '${m.name}' has unknown dependency '${dep}'`);
      }
      dependents.set(dep, [...(dependents.get(dep) ?? []), m.name]);
    }
    remaining.set(m.name, m.deps.length);
  }

  const queue = ms.filter((m) => m.deps.length === 0).map((m) => m.name);
  const ordered: ModuleManifest[] = [];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    ordered.push(byName.get(name) as ModuleManifest);
    for (const next of dependents.get(name) ?? []) {
      const left = (remaining.get(next) as number) - 1;
      remaining.set(next, left);
      if (left === 0) queue.push(next);
    }
  }

  if (ordered.length !== ms.length) {
    throw new Error(`module dependency cycle: ${findCycle(byName).join(' -> ')}`);
  }
  return ordered;
}

export interface DeclaredPermission {
  key: Permission;
  label: string;
  module: string;
  /** Empty for a plain on/off permission. */
  scopes: readonly Scope[];
  managerDefault: boolean;
}

export function allPermissions(ms: readonly ModuleManifest[] = modules): DeclaredPermission[] {
  const seen = new Set<string>();
  const out: DeclaredPermission[] = [];
  for (const m of ms) {
    for (const [key, def] of Object.entries(m.permissions) as [Permission, PermissionDef][]) {
      if (seen.has(key)) throw new Error(`duplicate permission '${key}'`);
      seen.add(key);
      out.push({
        key,
        label: def.label,
        module: m.name,
        scopes: def.scopes ?? [],
        managerDefault: def.managerDefault ?? false,
      });
    }
  }
  return out;
}
