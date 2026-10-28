'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { RiArrowRightSLine, RiLogoutBoxRLine } from '@remixicon/react';
import type { NavGroup } from '@erp/contracts';
import type { AccessContext } from '@erp/auth/permissions';
import { cn } from '../lib/cn';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/collapsible';
import { Separator } from '../components/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '../components/sidebar';
import { UserAvatar } from '../page/user-avatar';
import type { ShellIdentity } from '../shell/account-menu';
import { filterNav } from './filter-nav';
import { NavIcon } from './icons';

// A group row and a leaf row are the same control at a glance.
function itemClasses(active: boolean) {
  return cn(
    'h-auto rounded px-3 py-2 text-[13px] transition-colors hover:bg-white/10 hover:text-white active:bg-white/10 active:text-white',
    active
      ? 'bg-white/15 font-bold text-white data-active:bg-white/15 data-active:font-bold data-active:text-white'
      : 'font-medium text-white/68',
  );
}

function subItemClasses(active: boolean) {
  return cn(
    'h-auto rounded px-2.5 py-1.5 text-[12.5px] transition-colors hover:bg-white/10 hover:text-white active:bg-white/10 active:text-white',
    active
      ? 'bg-white/12 font-bold text-white data-active:bg-white/12 data-active:font-bold data-active:text-white'
      : 'font-medium text-white/60',
  );
}

export function AppSidebar({
  groups,
  access,
  identity,
  onSignOut,
  profileHref,
}: {
  groups: NavGroup[];
  access: AccessContext;
  identity: ShellIdentity;
  onSignOut: () => void;
  profileHref: string;
}) {
  const pathname = usePathname();
  const visible = filterNav(groups, access, pathname);
  // The sidebar primitive has no router awareness, so without this the drawer stays over the page you just opened.
  const { setOpenMobile } = useSidebar();
  const closeDrawer = () => setOpenMobile(false);
  // Controlled open state: each group follows "is it the active group" until the user toggles it,
  // and navigating to a new page resets that, so the group you land in is always open.
  const [toggles, setToggles] = useState<{ pathname: string; open: Record<string, boolean> }>({ pathname, open: {} });
  if (toggles.pathname !== pathname) setToggles({ pathname, open: {} });
  const isOpen = (label: string, active: boolean) => toggles.open[label] ?? active;
  const setOpen = (label: string, open: boolean) => setToggles((t) => ({ ...t, open: { ...t.open, [label]: open } }));

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0">
      <div className="flex h-full flex-col bg-linear-to-b from-rail-from to-rail-to px-3 pt-[18px] pb-3.5 text-white">
        <SidebarHeader className="mb-1.5 gap-4 p-0 px-2.5 pt-1 pb-4">
          <div className="grid gap-1">
            <span className="font-heading text-xl font-extrabold tracking-tight">ERP</span>
            <span className="px-0.5 text-[10.5px] tracking-widest text-white/50">Business management</span>
          </div>
          <Separator className="bg-white/10" />
        </SidebarHeader>

        <SidebarContent className="flex-1 gap-0 overflow-y-auto">
          <SidebarGroup className="p-0">
            <SidebarMenu className="gap-0.5">
              {visible.map((group) => (
                <Collapsible
                  key={group.label}
                  open={isOpen(group.label, group.active)}
                  onOpenChange={(open) => setOpen(group.label, open)}
                  render={<SidebarMenuItem />}
                >
                  <CollapsibleTrigger
                    render={<SidebarMenuButton className={cn('group/trigger', itemClasses(group.active))} />}
                  >
                    <NavIcon name={group.icon} />
                    <span className="flex-1 text-left">{group.label}</span>
                    <RiArrowRightSLine className="size-4 shrink-0 opacity-60 transition-transform duration-150 ease-out-quint group-data-[panel-open]/trigger:rotate-90 motion-reduce:transition-none" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub className="mx-0 border-white/12 pl-3">
                      {group.items.map((item) => (
                        <SidebarMenuSubItem key={item.href}>
                          <SidebarMenuSubButton
                            isActive={item.href === group.activeHref}
                            render={<Link href={item.href} />}
                            onClick={closeDrawer}
                            className={subItemClasses(item.href === group.activeHref)}
                          >
                            <NavIcon name={item.icon} />
                            <span>{item.label}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="mt-3 flex-row items-center gap-1 rounded-md border border-white/[0.09] bg-white/[0.07] p-1.5 transition-colors duration-200 ease-out-quint hover:border-white/15 motion-reduce:transition-none">
          <Link
            href={profileHref}
            onClick={closeDrawer}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded px-1.5 py-1 transition-[transform,background-color] duration-150 ease-out-quint hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none active:scale-99 motion-reduce:transition-none"
          >
            <UserAvatar name={identity.name} avatarUrl={identity.avatarUrl} className="size-8" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[12.5px] font-semibold">{identity.name}</div>
              <div className="truncate text-[10.5px] text-white/55">{identity.subtitle}</div>
            </div>
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="grid size-7 shrink-0 place-items-center rounded text-white/55 transition-[transform,color,background-color] duration-150 ease-out-quint hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none active:scale-92 motion-reduce:transition-none"
          >
            <RiLogoutBoxRLine className="size-4" aria-hidden="true" />
          </button>
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}
