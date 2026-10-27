export type Permission = `${string}.${string}`;

export interface NavItem {
  label: string;
  href: string;
  /** Remix icon component name; kept a string so contracts stay React-free. */
  icon: string;
  permission: Permission | null;
}

export interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

export interface ModuleManifest {
  name: string;
  deps: readonly string[];
  /** Permission key to human label. */
  permissions: Record<Permission, string>;
  nav: NavGroup[];
  events: readonly string[];
}

export function defineModule<M extends ModuleManifest>(m: M): M {
  return m;
}
