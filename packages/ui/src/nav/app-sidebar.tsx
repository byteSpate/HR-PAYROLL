'use client';

import Link from 'next/link';
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

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {visible.map((group) => (
              // defaultOpen only seeds the state; the user can still collapse the active group.
              <Collapsible key={group.label} defaultOpen={group.active} render={<SidebarMenuItem />}>
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
