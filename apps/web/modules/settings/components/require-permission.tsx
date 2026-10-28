'use client';

import { can } from '@erp/auth/permissions';
import { useSession } from '@/lib/session';

/** True when the user holds the permission, or any entry of a list (same rule as nav items). */
export function holds(user: Parameters<typeof can>[0], permission: string | readonly string[]): boolean {
  return (typeof permission === 'string' ? [permission] : permission).some((p) => can(user, p));
}

// UX only: the API enforces the same permission on every call.
export function RequirePermission({
  permission,
  children,
}: {
  permission: string | readonly string[];
  children: React.ReactNode;
}) {
  const { user } = useSession();
  if (!user || !holds(user, permission)) {
    return <p className="text-sm text-muted-foreground">You do not have access to this page.</p>;
  }
  return <>{children}</>;
}
