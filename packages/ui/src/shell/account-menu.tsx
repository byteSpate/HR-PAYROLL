'use client';

import Link from 'next/link';
import { RiArrowDownSLine, RiLogoutBoxRLine, RiUser3Line } from '@remixicon/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/dropdown-menu';
import { UserAvatar } from '../page/user-avatar';

export interface ShellIdentity {
  name: string;
  /** Under the name: the person's role, so on a payroll system "who am I signed in as" is never a guess. */
  subtitle: string;
  avatarUrl?: string | null;
  email?: string;
}

export function AccountMenu({
  identity,
  onSignOut,
  profileHref,
}: {
  identity: ShellIdentity;
  onSignOut: () => void;
  profileHref: string;
}) {
  const { name, subtitle, avatarUrl, email } = identity;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // A raw button rather than ui/button: no variant describes a 34px identity chip, and each would have to be undone.
        className="group flex items-center gap-2.5 rounded-md py-1 pr-1.5 pl-1 transition-[transform,background-color] duration-150 ease-out-quint hover:bg-canvas focus-visible:ring-2 focus-visible:ring-rail-from/25 focus-visible:outline-none active:scale-97 motion-reduce:transition-none"
        aria-label={`Account menu for ${name}`}
      >
        <UserAvatar name={name} avatarUrl={avatarUrl} className="size-8.5" />
        {/* The identity text drops on narrow screens and the avatar carries it alone. */}
        <div className="hidden max-w-40 text-left leading-tight lg:block">
          <div className="truncate text-[13px] font-semibold">{name}</div>
          <div className="truncate text-[11px] text-slate">{subtitle}</div>
        </div>
        <RiArrowDownSLine
          aria-hidden="true"
          className="hidden size-4 text-[#8A94A3] transition-transform duration-150 ease-out-quint group-data-popup-open:rotate-180 motion-reduce:transition-none lg:block"
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-1.5">
        <div className="flex items-center gap-2.5 px-1.5 py-2">
          <UserAvatar name={name} avatarUrl={avatarUrl} className="size-9" />
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold">{name}</div>
            {email ? <div className="truncate text-[11.5px] text-slate">{email}</div> : null}
          </div>
        </div>
        <div className="px-1.5 pb-2">
          <span className="inline-flex items-center rounded bg-[#F1F4F8] px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-[#3F4A59] uppercase">
            {subtitle}
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem render={<Link href={profileHref} />} className="gap-2 px-2 py-2 text-[13px] font-medium">
          <RiUser3Line className="size-4 text-slate" />
          My profile
        </DropdownMenuItem>

        <DropdownMenuItem variant="destructive" onClick={onSignOut} className="gap-2 px-2 py-2 text-[13px] font-medium">
          <RiLogoutBoxRLine className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
