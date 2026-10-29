"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation } from "@tanstack/react-query"
import {
  RiCheckLine,
  RiComputerLine,
  RiKey2Line,
  RiLogoutBoxRLine,
  RiPencilLine,
  RiShieldKeyholeLine,
  RiSubtractLine,
  type RemixiconComponentType,
} from "@remixicon/react"

import { clearOwnAvatar, logoutEverywhere, setDisplayName, uploadOwnAvatar } from "@/modules/settings/api"
import { summarizeGrants } from "@/modules/settings/permission-summary"
import { useSession } from "@/lib/session"
import type { MyProfileResponse } from "../types"
import {
  ConfirmDialog,
  DialogActions,
  Field,
  FormError,
  TONE,
  toMessage,
} from "@erp/ui/dashboard"
import { AvatarUpload } from "./avatar-upload"
import { SessionsCard } from "./sessions-card"
import { Tag } from "@erp/ui/dashboard"
import type { Tone } from "@erp/ui/dashboard"
import { Button } from "@erp/ui/components/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@erp/ui/components/dialog"
import { Input } from "@erp/ui/components/input"
import { cn } from "@erp/ui/lib/cn"

/**
 * The profile for an account with no employee record — an administrator's, or
 * anyone given a role but never hired.
 *
 * This replaced `AccountOnlyCard`, a single card holding an email, a role and
 * one sentence, whose comment argued that "for these roles there genuinely is
 * nothing more". That was true only because the endpoint built its account
 * block straight off the JWT and never read the row. There is plenty more:
 * when the account was opened, what is signed in to it, and what it may do.
 *
 * Still deliberately absent: anything resembling the dashboard's approval
 * queue. What is waiting on you is a landing-page question, and answering it
 * twice is how the two copies start disagreeing.
 */

/** What the account is called: its level, or the role a standard account was given. */
function roleLabel(account: MyProfileResponse["account"]): string {
  if (account.accessLevel === "SUPER_ADMIN") return "Super Admin"
  if (account.accessLevel === "ADMIN") return "Admin"
  return account.role?.name ?? "No role"
}

const SCOPE_LABEL = { own: "Own", team: "Team", department: "Department", all: "Everyone" } as const

/**
 * The one thing these accounts cannot do, said plainly.
 *
 * Without an Employee row there is no leave balance, no payslip and no
 * attendance record, and every one of those pages is reachable in the nav.
 * Reaching one and finding it empty reads as a broken page.
 */
const CANNOT = "File leave, expenses or timesheets — those need an employee record"

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

export function AccountProfile({
  account,
  onChanged,
}: {
  account: MyProfileResponse["account"]
  /** Refetches the profile after a name or photo change. */
  onChanged: () => void
}) {
  const { accessToken, user, signOut } = useSession()
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [nameOpen, setNameOpen] = useState(false)

  // Their own name once set, and the email until then — never a blank heading.
  const displayed = account.displayName ?? account.email

  const signOutAll = useMutation({
    mutationFn: () => logoutEverywhere(accessToken!),
    // Local teardown after the server call, exactly as the header's sign-out
    // does. `signOut` posts to /logout on its way through, which is a
    // no-op now the tokens are gone and is caught either way.
    onSettled: () => signOut(),
  })

  return (
    <>
      <header className="mb-4 flex flex-wrap items-start gap-4 rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
        <AvatarUpload
          upload={(file) => uploadOwnAvatar(accessToken!, file)}
          remove={() => clearOwnAvatar(accessToken!)}
          avatarUrl={account.avatarUrl}
          fullName={displayed}
          editable
          onChanged={onChanged}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-[21px] font-bold tracking-tight break-words">
              {displayed}
            </h1>
            <button
              type="button"
              onClick={() => setNameOpen(true)}
              aria-label="Edit your name"
              title="Edit your name"
              className="rounded p-1 text-[#7A8698] hover:bg-[#F4F6F9] hover:text-[#17191C]"
            >
              <RiPencilLine className="size-3.5" aria-hidden />
            </button>
          </div>
          {/* The email stays visible even once a name is set: it is what they
              sign in with, and the heading no longer says it. */}
          <div className="mt-0.5 text-[13px] break-words text-[#5F6B7C]">{account.email}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-[#5F6B7C]">
            <Tag label={roleLabel(account)} tone="neutral" />
            <span>Account opened {monthYear(account.createdAt)}</span>
          </div>
        </div>
      </header>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Security" icon={RiShieldKeyholeLine}>
          {/* Session count and last-active used to sit here too. They moved
              wholesale to SessionsCard rather than being repeated: the same
              fact in two places is the defect that had the admin dashboard
              restating the activity log. */}
          <Facts
            rows={[
              {
                label: "Password",
                value: account.mustChangePassword ? "Must be changed" : "Set",
                tone: account.mustChangePassword ? "yellow" : undefined,
              },
              // Under Security rather than beside the name: the address is the
              // sign-in identity and the password-reset target, so it belongs
              // with the password, not with the contact details.
              { label: "Sign-in email", value: account.email },
              { label: "Account opened", value: monthYear(account.createdAt) },
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EFF2F6] pt-4">
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link href="/change-password" />}
            >
              <RiKey2Line className="size-4" aria-hidden />
              Change password
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={account.sessions.count === 0 || signOutAll.isPending}
              onClick={() => setConfirmSignOut(true)}
              className="text-[#8A5E0C] hover:bg-[#FDF8EE] hover:text-[#6E4A09]"
            >
              <RiLogoutBoxRLine className="size-4" aria-hidden />
              Sign out everywhere
            </Button>
          </div>
        </Panel>

        <Panel title={`What ${roleLabel(account)} can do`} icon={RiComputerLine}>
          <PermissionList account={account} grants={user?.grants ?? []} />
        </Panel>
      </div>

      <div className="mb-4">
        <SessionsCard />
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out everywhere?"
        body={
          <>
            Every device signed in to this account is signed out, <strong>including this one</strong>
            . Nothing else changes — your account, role and password stay exactly as they are.
          </>
        }
        confirmLabel="Sign out everywhere"
        pending={signOutAll.isPending}
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => signOutAll.mutate()}
      />

      <EditDisplayNameDialog
        open={nameOpen}
        current={account.displayName}
        email={account.email}
        onOpenChange={setNameOpen}
        onSaved={onChanged}
      />
    </>
  )
}

/**
 * What this account is actually allowed to do, read from the permissions it holds.
 *
 * Roles here are made by administrators, so there is no fixed sentence per role to print. Admin
 * levels hold everything implicitly and carry no grants, which is why they are told apart first.
 */
function PermissionList({
  account,
  grants,
}: {
  account: MyProfileResponse["account"]
  grants: readonly string[]
}) {
  const groups = account.accessLevel === "STANDARD" ? summarizeGrants(grants) : []

  return (
    <ul className="space-y-2">
      {account.accessLevel !== "STANDARD" ? (
        <li className="flex items-start gap-2 text-[13px] leading-relaxed">
          <RiCheckLine className="mt-0.5 size-4 shrink-0 text-[#1E7A3C]" aria-hidden />
          <span>Every permission in the system</span>
        </li>
      ) : groups.length === 0 ? (
        <li className={cn("text-[13px] leading-relaxed", TONE.muted)}>
          No permissions yet — an administrator gives an account access by assigning it a role.
        </li>
      ) : (
        groups.map((group) => (
          <li key={group.module}>
            <div className={cn("mb-1 text-[11.5px] font-bold tracking-[1.1px] uppercase", TONE.muted)}>
              {group.module}
            </div>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-[13px] leading-relaxed">
                  <RiCheckLine className="mt-0.5 size-4 shrink-0 text-[#1E7A3C]" aria-hidden />
                  <span>
                    {item.label}
                    {item.scope ? <span className={TONE.muted}> · {SCOPE_LABEL[item.scope]}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))
      )}
      <li
        className={cn(
          "flex items-start gap-2 border-t border-[#EFF2F6] pt-2 text-[13px] leading-relaxed",
          TONE.muted
        )}
      >
        <RiSubtractLine className="mt-0.5 size-4 shrink-0 text-[#A5AFBE]" aria-hidden />
        <span>{CANNOT}</span>
      </li>
    </ul>
  )
}

/**
 * The name an administrative account shows under.
 *
 * Clearing it is a supported outcome, not an empty form: the heading falls
 * back to the email, which is where it started.
 */
function EditDisplayNameDialog({
  open,
  current,
  email,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  current: string | null
  email: string
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { accessToken } = useSession()
  const [value, setValue] = useState(current ?? "")
  const [error, setError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: () => setDisplayName(accessToken!, value.trim() === "" ? null : value),
    onSuccess: () => {
      setError(null)
      onOpenChange(false)
      onSaved()
    },
    onError: (err) => setError(toMessage(err)),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Reopening should show what is saved, not what was abandoned.
        if (next) setValue(current ?? "")
        setError(null)
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your name</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <Field
            label="Display name"
            htmlFor="display-name"
            hint={`Shown in the header and the sidebar. Leave it empty to show ${email} instead.`}
          >
            <Input
              id="display-name"
              value={value}
              maxLength={120}
              autoFocus
              placeholder={email}
              onChange={(event) => setValue(event.target.value)}
            />
          </Field>
          {error ? (
            <div className="mt-3">
              <FormError>{error}</FormError>
            </div>
          ) : null}
          <DialogFooter className="mt-4">
            <DialogActions
              pending={save.isPending}
              submitLabel="Save"
              disabled={value.trim() === (current ?? "")}
              onCancel={() => onOpenChange(false)}
              onSubmit={() => save.mutate()}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: RemixiconComponentType
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md border border-[#E4E9EF] bg-white px-5 py-4.5">
      <h2 className="mb-3.5 flex items-center gap-2 text-[13.5px] font-bold">
        <Icon className="size-4 text-[#8A94A2]" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Label left, value right — the same reading order every profile card uses. */
function Facts({
  rows,
}: {
  rows: { label: string; value: string; tone?: Tone }[]
}) {
  return (
    <dl className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt className={cn("text-[12.5px]", TONE.muted)}>{row.label}</dt>
          <dd className="text-right text-[13px] font-semibold">
            {row.tone ? <Tag label={row.value} tone={row.tone} /> : row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
