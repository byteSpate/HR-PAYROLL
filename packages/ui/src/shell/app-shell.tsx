'use client';

import type { CSSProperties, ReactNode } from 'react';
import type { NavGroup } from '@erp/contracts';
import type { AccessContext } from '@erp/auth/permissions';
import { SidebarProvider } from '../components/sidebar';
import { AppSidebar } from '../nav/app-sidebar';
import { Header } from './header';
import type { ShellIdentity } from './account-menu';

// The primitive's default is 16rem; the original is 236px. The provider spreads `style` after its
// defaults, so this is the override point and a `shadcn add` cannot undo it.
const SHELL_STYLE = { '--sidebar-width': '236px' } as CSSProperties;

export function AppShell({
  groups,
  access,
  identity,
  onSignOut,
  profileHref,
  headerSlot,
  children,
}: {
  groups: NavGroup[];
  access: AccessContext;
  identity: ShellIdentity;
  onSignOut: () => void;
  profileHref: string;
  /** Sits left of the account chip: the notification bell. */
  headerSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider style={SHELL_STYLE}>
      <AppSidebar groups={groups} access={access} identity={identity} onSignOut={onSignOut} profileHref={profileHref} />
      {/* Deliberately not SidebarInset: it renders its own <main>, and nested <main> is invalid. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header identity={identity} onSignOut={onSignOut} profileHref={profileHref} slot={headerSlot} />
        <main className="mx-auto flex w-full max-w-[1220px] flex-1 flex-col px-4 pb-8 sm:px-6 lg:px-7 2xl:max-w-[1600px]">
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
