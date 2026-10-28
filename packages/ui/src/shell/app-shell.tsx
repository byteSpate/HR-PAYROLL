"use client"

import { cn } from "../lib/cn"
import { SidebarProvider } from "../components/sidebar"
import type { NavGroup } from "@erp/contracts"
import { Header } from "./header"
import { Sidebar } from "./sidebar"
import type { ShellIdentity } from "./types"

export function AppShell({
  navGroups,
  rootHref,
  profileHref,
  systemLabel,
  brand,
  identity,
  onSignOut,
  signingOut,
  badges,
  headerSlot,
  mainClassName = "max-w-[1220px] 2xl:max-w-[1600px]",
  children,
}: {
  navGroups: NavGroup[]
  /** The dashboard route: active on itself only, so it never sits over every page. */
  rootHref: string
  profileHref: string
  systemLabel?: string
  brand: React.ReactNode
  identity: ShellIdentity
  onSignOut: () => void
  signingOut?: boolean
  /** Counts keyed by item `href`. */
  badges?: Record<string, number>
  /** Left of the account chip: the notification bell. */
  headerSlot?: React.ReactNode
  /** The content cap. */
  mainClassName?: string
  children: React.ReactNode
}) {
  return (
    // The primitive's default width is 16rem; ours is 236px. It sets the
    // variable as an inline style on its own wrapper, so this style prop —
    // spread after the defaults — is the override point. Editing the vendored
    // constant would be undone by the next `shadcn add`.
    <SidebarProvider style={{ "--sidebar-width": "236px" } as React.CSSProperties}>
      <Sidebar
        navGroups={navGroups}
        rootHref={rootHref}
        profileHref={profileHref}
        systemLabel={systemLabel}
        brand={brand}
        identity={identity}
        onSignOut={onSignOut}
        signingOut={signingOut}
        badges={badges}
      />
      {/* Deliberately not SidebarInset: that renders its own <main>, and the
          content area below already is one. Nested <main> is invalid. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header profileHref={profileHref} identity={identity} onSignOut={onSignOut} signingOut={signingOut} slot={headerSlot} />
        <main className={cn("mx-auto flex w-full flex-1 flex-col px-4 pb-8 sm:px-6 lg:px-7", mainClassName)}>
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
