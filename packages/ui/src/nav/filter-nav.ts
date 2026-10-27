import type { NavGroup } from '@erp/contracts';
import { hasPermission } from '@erp/auth/permissions';

export interface VisibleGroup extends NavGroup {
  active: boolean;
  activeHref: string | null;
}

// Prefix match needs the trailing slash so "/settingsx" does not light up "/settings".
function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function filterNav(
  groups: NavGroup[],
  permissions: readonly string[],
  pathname: string,
): VisibleGroup[] {
  const visible: VisibleGroup[] = [];
  for (const group of groups) {
    const items = group.items.filter(
      (item) => item.permission === null || hasPermission(permissions, item.permission),
    );
    if (items.length === 0) continue;

    // Longest href wins so "/settings/roles" beats a sibling "/settings" entry.
    let activeHref: string | null = null;
    for (const item of items) {
      if (matches(pathname, item.href) && (activeHref === null || item.href.length > activeHref.length)) {
        activeHref = item.href;
      }
    }
    visible.push({ ...group, items, active: activeHref !== null, activeHref });
  }
  return visible;
}
