import { modules, resolveModuleOrder, type NavGroup } from '@erp/contracts';

/**
 * Modules each contribute their own groups, and several add to the same one ("My Space" holds the
 * profile, attendance and leave). Groups sharing a label fold into one, items in module order, and
 * the group sits at its lowest `order`.
 */
export function mergeNavGroups(groups: readonly NavGroup[]): NavGroup[] {
  const byLabel = new Map<string, NavGroup>();
  for (const g of groups) {
    const existing = byLabel.get(g.label);
    if (existing) {
      existing.items.push(...g.items);
      existing.order = Math.min(existing.order, g.order);
    } else {
      byLabel.set(g.label, { ...g, items: [...g.items] });
    }
  }
  return [...byLabel.values()].sort((a, b) => a.order - b.order);
}

export const navGroups = mergeNavGroups(resolveModuleOrder(modules).flatMap((m) => m.nav));
