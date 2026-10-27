'use client';

import { hasPermission } from '@erp/auth/permissions';
import { useSession } from '@/lib/session';

// UX only: the API enforces the same permission on every call.
export function RequirePermission({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { user } = useSession();
  if (!user || !hasPermission(user.permissions, permission)) {
    return <p className="text-sm text-muted-foreground">You do not have access to this page.</p>;
  }
  return <>{children}</>;
}
