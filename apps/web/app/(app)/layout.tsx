'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppShell } from '@erp/ui/shell';
import { navGroups } from '@/lib/nav';
import { loginPathFor } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { ChangePasswordDialog } from '@/modules/settings/components/change-password-dialog';

const ACCESS_LEVEL_LABEL = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin' } as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, status, signOut } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace(loginPathFor(pathname, window.location.search));
    }
  }, [status, pathname, router]);

  if (status !== 'authenticated' || !user) {
    return <div className="grid min-h-[100dvh] place-items-center text-sm text-muted-foreground">Loading…</div>;
  }

  // Nothing else mounts until the temporary password is replaced, so no page or sidebar query fires meanwhile.
  if (user.mustChangePassword) return <ChangePasswordDialog />;

  const subtitle = user.accessLevel === 'STANDARD' ? (user.role?.name ?? 'Employee') : ACCESS_LEVEL_LABEL[user.accessLevel];

  return (
    <AppShell
      groups={navGroups}
      access={user}
      identity={{ name: user.displayName, subtitle, email: user.email }}
      onSignOut={() => void signOut()}
      profileHref="/me"
    >
      {children}
    </AppShell>
  );
}
