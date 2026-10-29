"use client"

import { RiLockLine } from "@remixicon/react"
import { useRouter } from "next/navigation"

import { PageHeader, TONE, icons, type IconName } from "@erp/ui/dashboard"
import { Tabs, TabsList, TabsTrigger } from "@erp/ui/components/tabs"
import { navGroups } from "@/lib/nav"
import { useSession } from "@/lib/session"
import { holds } from "./require-permission"

/**
 * HR's Settings is one page with a tab strip over its panels. Here each panel is its own route
 * (the sidebar's Settings item expands into one page per panel), so the strip navigates instead of
 * switching in place, and is built from the same nav entries the sidebar draws.
 *
 * This is UX only. Every panel's routes check the permission server-side.
 */
export function SettingsPage({ section, children }: { section: string; children: React.ReactNode }) {
  const { user } = useSession()
  const router = useRouter()

  if (!user) return null

  const tabs = (
    navGroups.flatMap((group) => group.items).find((item) => item.label === "Settings")?.children ?? []
  ).filter((child) => child.permission === null || holds(user, child.permission))

  if (tabs.length === 0) {
    // Unreachable from the sidebar, which hides Settings when no child is open. It exists so a
    // typed URL produces a sentence rather than an empty strip.
    return (
      <>
        <PageHeader
          kicker="Administration"
          title="Settings"
          sub="Reference data the rest of the system is built from."
        />
        <div className="rounded-md border border-[#E4E9EF] bg-white px-5 py-12 text-center">
          <span className="mx-auto mb-3 flex size-9 items-center justify-center rounded-md bg-[#F1F4F8] text-[#5F6B7C]">
            <RiLockLine className="size-5" aria-hidden />
          </span>
          <div className="text-[13.5px] font-bold">Nothing here for you</div>
          <p className={`mx-auto mt-1 max-w-[44ch] text-[12.5px] leading-relaxed ${TONE.muted}`}>
            Settings holds the reference tables the rest of the system is built from. Ask an administrator if you need a
            change made to one.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        kicker="Administration"
        title="Settings"
        sub="Reference data the rest of the system is built from."
      />

      {/*
        A horizontal strip, not a left rail. The dashboard already owns a
        vertical nav down the left edge, and a second one inside the page reads
        as a competing hierarchy rather than a section switcher.

        Underline tabs rather than the filled pills the sidebar uses, so the two
        navigations do not share an active treatment either.
      */}
      <Tabs value={section} onValueChange={(href) => router.push(String(href))} className="gap-0">
        <TabsList
          variant="line"
          /* `h-auto!` is load-bearing: the primitive pins a horizontal list to
             `h-8` through `group-data-horizontal/tabs:h-8`, which outranks a
             plain utility on specificity. */
          className="h-auto! w-full justify-start gap-6 rounded-none border-b border-[#E4E9EF] bg-transparent p-0"
        >
          {tabs.map(({ href, label, icon }) => {
            const Icon = icon ? icons[icon as IconName] : undefined
            return (
              <TabsTrigger
                key={href}
                value={href}
                /* `after:hidden` drops the primitive's own indicator; this uses a
                   bottom border so the active tab sits on the list's hairline.
                   The colour is set on `border-b` alone, because `data-active:
                   border-*` would paint all four sides of the trigger. */
                className="h-auto flex-none gap-2 rounded-none border-b-2 border-transparent px-0 pt-0 pb-2.5 text-[13px] font-semibold text-[#5F6B7C] transition-colors after:hidden hover:text-[#1C2733] data-active:border-b-[#17191C] data-active:bg-transparent data-active:text-[#1C2733]"
              >
                {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
                {label}
              </TabsTrigger>
            )
          })}
        </TabsList>

        {/* A short fade marks that the panel below the strip changed. It is
            the only motion on this screen. */}
        <div className="min-w-0 pt-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none">
          {children}
        </div>
      </Tabs>
    </>
  )
}
