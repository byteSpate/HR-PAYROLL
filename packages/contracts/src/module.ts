export type Permission = `${string}.${string}`;

export type Scope = 'own' | 'team' | 'department' | 'all';

export interface PermissionDef {
  label: string;
  /** Scopes this permission supports, narrowest first. Omitted means plain on/off. */
  scopes?: readonly Scope[];
  /** Whether a user with active direct reports holds the `team` scope implicitly. */
  managerDefault?: boolean;
}

export interface NavItem {
  label: string;
  href: string;
  /** Remix icon component name; kept a string so contracts stay React-free. */
  icon: string;
  /** 'key' or 'key:scope'. An array shows the item when any entry is held. */
  permission: string | string[] | null;
}

export interface NavGroup {
  label: string;
  /** Sidebar position, ascending; modules pick numbers so the order is not registry order. */
  order: number;
  icon: string;
  items: NavItem[];
}

export interface ModuleManifest {
  name: string;
  deps: readonly string[];
  permissions: Record<Permission, PermissionDef>;
  nav: NavGroup[];
  events: readonly string[];
}

export function defineModule<M extends ModuleManifest>(m: M): M {
  return m;
}
