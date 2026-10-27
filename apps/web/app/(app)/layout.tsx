'use client';

import { RiLogoutBoxRLine, RiUserLine } from '@remixicon/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Button } from '@erp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@erp/ui/components/dropdown-menu';
import { Separator } from '@erp/ui/components/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@erp/ui/components/sidebar';
import { AppSidebar } from '@erp/ui/nav';
import { navGroups } from '@/lib/nav';
import { loginPathFor } from '@/lib/return-to';
import { useSession } from '@/lib/session';
import { ChangePasswordDialog } from '@/modules/settings/components/change-password-dialog';

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

  return (
    <SidebarProvider>
      <AppSidebar groups={navGroups} access={user} />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                <RiUserLine />
                <span>{user.displayName}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <RiLogoutBoxRLine />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
