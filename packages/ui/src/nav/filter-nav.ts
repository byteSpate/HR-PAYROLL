import type { NavGroup, NavItem } from '@erp/contracts';
import { can, type AccessContext } from '@erp/auth/permissions';

const holds = (access: AccessContext, permission: string | string[] | null): boolean =>
  // An array means any-of.
  permission === null || [permission].flat().some((required) => can(access, required));

/**
 * What this user may open. A collapsible item keeps only its permitted children and disappears when
 * it has none (its own permission is not consulted); a heading with nothing left disappears too.
 * Which item is active is the sidebar's business, since it already knows the pathname.
 */
export function filterNav(groups: readonly NavGroup[], access: AccessContext): NavGroup[] {
  const visible: NavGroup[] = [];
  for (const group of groups) {
    const items = group.items.flatMap((item): NavItem[] => {
      if (!item.children) return holds(access, item.permission) ? [item] : [];
      const children = item.children.filter((c) => holds(access, c.permission));
      return children.length > 0 ? [{ ...item, children }] : [];
    });
    if (items.length > 0) visible.push({ ...group, items });
  }
  return visible;
}
