'use client';

import type { ReactNode } from 'react';
import { RiMenuLine } from '@remixicon/react';
import { Button } from '../components/button';
import { useSidebar } from '../components/sidebar';
import { AccountMenu, type ShellIdentity } from './account-menu';

// Not SidebarTrigger: that primitive hard-codes a panel-toggle glyph, and the design calls for a hamburger.
function MenuButton() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Open menu"
      // The permanent sidebar takes over at lg, so the trigger retires there.
      className="size-9 shrink-0 rounded border-line text-rail-from transition-transform duration-150 ease-out-quint hover:bg-canvas active:scale-97 motion-reduce:transition-none lg:hidden"
      onClick={toggleSidebar}
    >
      <RiMenuLine className="size-4" />
    </Button>
  );
}

export function Header({
  identity,
  onSignOut,
  profileHref,
  slot,
}: {
  identity: ShellIdentity;
  onSignOut: () => void;
  profileHref: string;
  slot?: ReactNode;
}) {
  return (
    <header className="flex h-15 items-center gap-4 border-b border-line bg-white px-4 sm:px-7">
      <MenuButton />
      <div className="ml-auto flex items-center gap-3 sm:gap-4.5">
        {slot}
        <AccountMenu identity={identity} onSignOut={onSignOut} profileHref={profileHref} />
      </div>
    </header>
  );
}
