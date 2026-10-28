'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { RiArrowRightSLine } from '@remixicon/react';
import type { NavGroup } from '@erp/contracts';
import type { AccessContext } from '@erp/auth/permissions';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '../components/sidebar';
import { filterNav } from './filter-nav';
import { NavIcon } from './icons';

export function AppSidebar({
  groups,
  access,
}: {
  groups: NavGroup[];
  access: AccessContext;
}) {
  const pathname = usePathname();
  const visible = filterNav(groups, access, pathname);
  // Controlled open state: each group follows "is it the active group" until the user toggles it,
  // and navigating to a new page resets that, so the group you land in is always open.
  const [toggles, setToggles] = useState<{ pathname: string; open: Record<string, boolean> }>({ pathname, open: {} });
  if (toggles.pathname !== pathname) setToggles({ pathname, open: {} });
  const isOpen = (label: string, active: boolean) => toggles.open[label] ?? active;
  const setOpen = (label: string, open: boolean) => setToggles((t) => ({ ...t, open: { ...t.open, [label]: open } }));

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {visible.map((group) => (
              <Collapsible
                key={group.label}
                open={isOpen(group.label, group.active)}
                onOpenChange={(open) => setOpen(group.label, open)}
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={<SidebarMenuButton className="group/trigger" />}
                >
                  <NavIcon name={group.icon} />
                  <span>{group.label}</span>
                  <RiArrowRightSLine className="ml-auto transition-transform group-data-[panel-open]/trigger:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {group.items.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          isActive={item.href === group.activeHref}
                          render={<Link href={item.href} />}
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
    </Sidebar>
  );
}
