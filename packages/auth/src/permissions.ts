// Browser-safe: this module is also exported as @erp/auth/permissions, so it must not
// import node built-ins, bcrypt or jsonwebtoken.

export interface RoleWithPermissions {
  permissions: { permissionKey: string }[];
}

export function effectivePermissions(roles: RoleWithPermissions[]): string[] {
  const keys = new Set<string>();
  for (const role of roles) {
    for (const permission of role.permissions) {
      keys.add(permission.permissionKey);
    }
  }
  return [...keys].sort();
}

export function hasPermission(granted: readonly string[], required: string): boolean {
  return granted.includes(required);
}
