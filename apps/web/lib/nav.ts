import { modules, resolveModuleOrder, type NavGroup, type NavItem } from '@erp/contracts';

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
      for (const item of g.items) addItem(existing.items, item);
      existing.order = Math.min(existing.order, g.order);
    } else {
      const items: NavItem[] = [];
      for (const item of g.items) addItem(items, item);
      byLabel.set(g.label, { ...g, items });
    }
  }
  return [...byLabel.values()].sort((a, b) => a.order - b.order);
}

/**
 * An expandable item that shares its label with one already there joins it, so modules each add
 * their own pages to a single Settings. Plain items never merge; a copy keeps the manifest intact.
 */
function addItem(items: NavItem[], item: NavItem): void {
  const same = item.children ? items.find((i) => i.children && i.label === item.label) : undefined;
  if (same?.children && item.children) same.children.push(...item.children);
  else items.push(item.children ? { ...item, children: [...item.children] } : item);
}

export const navGroups = mergeNavGroups(resolveModuleOrder(modules).flatMap((m) => m.nav));
