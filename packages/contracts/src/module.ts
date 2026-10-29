export type Permission = `${string}.${string}`;

export type Scope = 'own' | 'team' | 'department' | 'all';

export interface PermissionDef {
  label: string;
  /** Scopes this permission supports, narrowest first. Omitted means plain on/off. */
  scopes?: readonly Scope[];
  /** Whether a user with active direct reports holds the `team` scope implicitly. */
  managerDefault?: boolean;
}

/** A page inside a collapsible sidebar item. */
export interface NavChild {
  label: string;
  href: string;
  /** 'key' or 'key:scope'. An array shows the child when any entry is held. */
  permission: string | string[] | null;
  /** Only where the page shows its siblings as tabs (Settings); the sidebar does not draw it. */
  icon?: string;
}

export interface NavItem {
  label: string;
  href: string;
  /** Remix icon component name, looked up in the `@erp/ui/dashboard` icon registry; a string keeps contracts React-free. */
  icon: string;
  /** 'key' or 'key:scope'. An array shows the item when any entry is held. Ignored when `children` is set. */
  permission: string | string[] | null;
  /**
   * Present where one original page holds several sections, each with its own route. The item then
   * expands instead of navigating, and shows only the children the user may open.
   */
  children?: NavChild[];
}

/** A sidebar heading. Modules contribute items to headings by label, and the app merges them. */
export interface NavGroup {
  label: string;
  /** Heading position, ascending; the lowest `order` among contributors wins. */
  order: number;
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
