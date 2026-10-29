"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  RiCloseLine,
  RiLogoutBoxRLine,
  RiSearchLine,
  RiShieldUserLine,
  RiTimeLine,
} from "@remixicon/react"

import { cn } from "@erp/ui/lib/cn"
import { createUser, listRoleOptions, listUsers, setUserAccessLevel, setUserRole, setUserStatus } from "../api"
import { ApiError } from "@erp/utils"
import { useSession } from "@/lib/session"
import { holds } from "./require-permission"
import type { UserAccountView as UserAccount } from "@erp/contracts/core"
import { DataTable } from "@erp/ui/dashboard"
import { FilterChip } from "@erp/ui/dashboard"
import { MiniStat } from "@erp/ui/dashboard"
import { Tag } from "@erp/ui/dashboard"
import { UserAvatar } from "@erp/ui/dashboard"
import type { TableCell } from "@erp/ui/dashboard"
import { Button } from "@erp/ui/components/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@erp/ui/components/dialog"
import { Input } from "@erp/ui/components/input"
import { Label } from "@erp/ui/components/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@erp/ui/components/select"
import { Skeleton } from "@erp/ui/components/skeleton"

/**
 * What an account is called, and what the Change role dialog chooses between. Roles here are made by
 * administrators, so the list comes from the server; the two levels above them are fixed. The super
 * admin is not a choice: ownership moves only through the command-line transfer.
 */
const ADMIN_CHOICE = "admin"
const NO_ROLE_CHOICE = "none"

const roleLabel = (u: UserAccount): string =>
  u.accessLevel === "SUPER_ADMIN" ? "Super Admin" : u.accessLevel === "ADMIN" ? "Admin" : (u.role?.name ?? "No role")

const choiceOf = (u: UserAccount): string =>
  u.accessLevel === "ADMIN" ? ADMIN_CHOICE : (u.role?.id ?? NO_ROLE_CHOICE)

const isAdminLevel = (u: UserAccount) => u.accessLevel !== "STANDARD"

type StatusFilter = "all" | "active" | "deactivated"

/**
 * A row-level control. These were underlined `variant="link"` buttons, which
 * on a table of thirty rows gave sixty pieces of underlined text and a ~16px
 * tall hit area each. A bordered chip is a target you can hit on a laptop
 * trackpad, and it reads as a control rather than as prose.
 */
function RowAction({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: "default" | "destructive"
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded border px-2.5 py-1 text-[12px] font-semibold",
        "transition-[transform,background-color,border-color,color] duration-150 ease-out-quint",
        "focus-visible:ring-2 focus-visible:ring-[#17191C]/25 focus-visible:outline-none",
        "active:scale-97 disabled:pointer-events-none disabled:opacity-45 motion-reduce:transition-none",
        tone === "destructive"
          ? "border-[#EBD5D5] text-[#9C3232] hover:border-[#D9AFAF] hover:bg-[#FBF3F3]"
          : "border-[#E4E9EF] text-[#3F4A59] hover:border-[#CFD6E0] hover:bg-[#F7F9FC]"
      )}
    >
      {children}
    </button>
  )
}

function formatCreated(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function computeStats(users: UserAccount[]) {
  const deactivated = users.filter((u) => !u.isActive).length
  const admins = users.filter((u) => isAdminLevel(u) && u.isActive).length
  const staff = users.filter((u) => u.employee !== null).length

  return [
    {
      label: "Total accounts",
      value: String(users.length),
      sub: `${users.length - deactivated} active · ${deactivated} deactivated`,
    },
    {
      label: "Staff accounts",
      value: String(staff),
      sub: `${users.length - staff} administrative`,
    },
    // Promoted over anything else: this is the number that decides whether
    // the system can still be administered at all.
    {
      label: "Active admins",
      value: String(admins),
      sub: admins <= 1 ? "The only one who can still administer" : "Enough to avoid lockout",
    },
  ]
}

export function UsersPage() {
  const { user, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()

  const isAuthed = sessionStatus === "authenticated"
  // The server checks user.manage on every call; this only decides what to draw.
  const canManage = !!user && holds(user, "user.manage")
  // Appointing or removing an admin is the super admin's alone.
  const isSuperAdmin = user?.accessLevel === "SUPER_ADMIN"

  const [createOpen, setCreateOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [newRole, setNewRole] = useState(NO_ROLE_CHOICE)
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null)
  const [roleTarget, setRoleTarget] = useState<UserAccount | null>(null)
  const [roleChoice, setRoleChoice] = useState(NO_ROLE_CHOICE)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")

  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => listUsers(""),
    enabled: isAuthed && canManage,
  })

  const rolesQuery = useQuery({
    queryKey: ["roles", "options"],
    queryFn: listRoleOptions,
    enabled: isAuthed && canManage,
  })
  const roles = rolesQuery.data ?? []
  const roleName = (choice: string) =>
    choice === ADMIN_CHOICE ? "Admin" : choice === NO_ROLE_CHOICE ? "No role" : (roles.find((r) => r.id === choice)?.name ?? "Select a role")

  function handleError(err: unknown) {
    // Verbatim: the server's guards explain themselves ("This manager still
    // has 3 direct reports"), and a generic message would throw that away.
    setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["users"] })
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createUser({ email: email.trim(), displayName: name.trim(), roleId: newRole === NO_ROLE_CHOICE ? null : newRole }),
    onSuccess: (result) => {
      setError(null)
      setCreateOpen(false)
      setEmail("")
      setName("")
      setNewRole(NO_ROLE_CHOICE)
      setCreated({ email: result.user.email, temporaryPassword: result.temporaryPassword })
      invalidate()
    },
    onError: handleError,
  })

  const roleMutation = useMutation({
    mutationFn: async ({ target, choice }: { target: UserAccount; choice: string }) => {
      if (choice === ADMIN_CHOICE) {
        if (target.accessLevel !== "ADMIN") await setUserAccessLevel(target.id, "ADMIN")
        return
      }
      // Leaving admin first: an admin takes no role, so the level has to drop before one can be set.
      if (target.accessLevel === "ADMIN") await setUserAccessLevel(target.id, "STANDARD")
      await setUserRole(target.id, choice === NO_ROLE_CHOICE ? null : choice)
    },
    onSuccess: () => {
      setError(null)
      setRoleTarget(null)
      invalidate()
    },
    onError: handleError,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setUserStatus(id, isActive),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    onError: handleError,
  })

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data])
  // The stats describe the whole estate, not the current filter — "active
  // super admins: 1" has to stay true while somebody is searching, because it
  // is the number that says whether the system can still be administered.
  const stats = useMemo(() => computeStats(users), [users])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return users.filter((u) => {
      if (statusFilter === "active" && !u.isActive) return false
      if (statusFilter === "deactivated" && u.isActive) return false
      if (needle === "") return true
      return [u.email, u.displayName, u.employee?.fullName ?? "", u.employee?.employeeCode ?? "", roleLabel(u)]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [users, search, statusFilter])

  const activeCount = useMemo(() => users.filter((u) => u.isActive).length, [users])
  const filtering = search.trim() !== "" || statusFilter !== "all"

  const statusPending = statusMutation.isPending

  const rows: TableCell[][] = useMemo(
    () =>
      visible.map((u) => [
        {
          node: (
            <div className="flex min-w-0 items-center gap-2.5">
              {/* The same tinted square the directory uses. A table of thirty
                  monospaced-looking email addresses is a wall; one identifiable
                  mark per row is what makes it scannable. */}
              <UserAvatar
                name={u.employee?.fullName ?? u.displayName}
                className="size-8 rounded-md"
                textClassName="text-[11.5px]"
              />
              <div className="min-w-0">
                <div className="truncate font-semibold">{u.email}</div>
                <div className="truncate text-[12px] text-[#6B7789]">
                  {u.mustChangePassword
                    ? "Has not set a password yet"
                    : `Added ${formatCreated(u.createdAt)}`}
                </div>
              </div>
              {u.id === user?.id ? (
                // Knowing which row is yours is what stops someone changing
                // their own role and locking themselves out of the page.
                <span className="shrink-0 rounded bg-[#F1F4F8] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#3F4A59] uppercase">
                  You
                </span>
              ) : null}
            </div>
          ),
        },
        { text: roleLabel(u) },
        // The column that makes the page legible: which accounts are staff,
        // and which are pure administrative logins.
        u.employee ? { text: u.employee.fullName, sub: u.employee.employeeCode } : { text: "—" },
        {
          node: u.isActive ? (
            <Tag label="Active" tone="green" />
          ) : (
            <Tag label="Deactivated" tone="red" />
          ),
        },
        {
          node: (
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              {/* The super admin's level cannot be changed here, and an admin can be
                  appointed or removed only by them; the server refuses the rest. */}
              {u.accessLevel === "SUPER_ADMIN" || (isAdminLevel(u) && !isSuperAdmin) ? null : (
                <RowAction
                  onClick={() => {
                    setError(null)
                    setRoleChoice(choiceOf(u))
                    setRoleTarget(u)
                  }}
                >
                  Change role
                </RowAction>
              )}
              {/* No control on your own row: deactivating yourself revokes
                  your own session, and the server refuses it with a 409. */}
              {u.id === user?.id ? null : (
                <RowAction
                  tone={u.isActive ? "destructive" : "default"}
                  disabled={statusPending}
                  onClick={() => {
                    setError(null)
                    statusMutation.mutate({ id: u.id, isActive: !u.isActive })
                  }}
                >
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </RowAction>
              )}
            </div>
          ),
        },
      ]),
    [visible, user?.id, statusPending, statusMutation, isSuperAdmin]
  )

  if (sessionStatus === "loading") {
    return (
      <div className="pt-7">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!canManage) {
    return (
      <div className="mt-7 rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
        You do not have permission to manage user accounts.
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-7 pb-5.5">
        <div>
          <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#5F6B7C] uppercase">
            Administration
          </div>
          <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">Users</h1>
          <div className="text-[13px] text-[#5F6B7C]">
            System accounts, roles and access — who can sign in, and as what.
          </div>
        </div>
        <Button
          className="h-auto rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white transition-transform duration-150 ease-out-quint hover:bg-[#0E1012] active:scale-97 motion-reduce:transition-none"
          onClick={() => {
            setError(null)
            setCreateOpen(true)
          }}
        >
          Create account
        </Button>
      </div>

      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        {stats.map((stat, i) => (
          // Three cards, 40ms apart. Short enough that the row still reads as
          // one thing arriving rather than three things queuing.
          <div key={stat.label} className="rise-in" style={{ animationDelay: `${i * 40}ms` }}>
            <MiniStat label={stat.label} value={stat.value} sub={stat.sub} />
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-80">
          <RiSearchLine
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8A94A3]"
          />
          <input
            type="search"
            placeholder="Search by email, name or role"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search user accounts"
            className="h-10 w-full rounded-md border border-[#E4E9EF] bg-white pr-9 pl-9 text-[13px] transition-[border-color,box-shadow] duration-150 ease-out-quint outline-none placeholder:text-[#98A2B1] hover:border-[#CFD6E0] focus:border-[#17191C] focus:shadow-[0_0_0_3px_rgba(23,25,28,0.08)] motion-reduce:transition-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-[#8A94A3] transition-[transform,color,background-color] duration-150 ease-out-quint hover:bg-[#F1F4F8] hover:text-[#17191C] focus-visible:ring-2 focus-visible:ring-[#17191C]/25 focus-visible:outline-none active:scale-90 motion-reduce:transition-none"
            >
              <RiCloseLine className="size-4" />
            </button>
          ) : null}
        </div>
        <div className="flex gap-1.5">
          <FilterChip
            label="All"
            count={users.length}
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />
          <FilterChip
            label="Active"
            count={activeCount}
            active={statusFilter === "active"}
            onClick={() => setStatusFilter("active")}
          />
          <FilterChip
            label="Deactivated"
            count={users.length - activeCount}
            active={statusFilter === "deactivated"}
            onClick={() => setStatusFilter("deactivated")}
          />
        </div>
      </div>

      {error ? (
        <div className="fade-in mb-4 rounded-md border border-[#E4E9EF] bg-white px-5 py-3 text-[13px] text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      {usersQuery.isPending ? (
        <div className="space-y-2 rounded-md border border-[#E4E9EF] bg-white p-5.5">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : usersQuery.isError ? (
        <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
          Failed to load user accounts.{" "}
          <Button
            variant="link"
            className="h-auto p-0 font-semibold underline"
            onClick={() => usersQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="fade-in grid place-items-center rounded-md border border-dashed border-[#D9E0E9] bg-white px-6 py-14 text-center">
          <RiShieldUserLine aria-hidden="true" className="mb-3 size-7 text-[#B6BFCB]" />
          <p className="text-[13.5px] font-semibold">No accounts match that</p>
          <p className="mt-1 max-w-80 text-[12.5px] text-[#5F6B7C]">
            Try a shorter search, or switch the status filter back to All.
          </p>
          {filtering ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch("")
                setStatusFilter("all")
              }}
              className="mt-4 transition-transform duration-150 ease-out-quint active:scale-97 motion-reduce:transition-none"
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="fade-in">
          <DataTable
            title="User accounts"
            cols="1.9fr 1fr 1.1fr 0.8fr 1.1fr"
            headers={["Account", "Role", "Employee", "Status", ""]}
            rows={rows}
            action={
              filtering
                ? `${visible.length} of ${users.length} accounts`
                : `${users.length} account${users.length === 1 ? "" : "s"}`
            }
          />
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-[12.5px] text-[#7A8698]">
              A login with no employee record. Staff accounts are created from Employees, which
              also needs a department, designation and joining date.
            </div>
            <div>
              <Label htmlFor="user-email" className="mb-1.5 text-xs font-bold">
                Email
              </Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="user-name" className="mb-1.5 text-xs font-bold">
                Name
              </Label>
              <Input id="user-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5 text-xs font-bold">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v ?? NO_ROLE_CHOICE)}>
                <SelectTrigger className="w-full">
                  <SelectValue>{(v: string | null) => (v ? roleName(v) : "Select a role")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ROLE_CHOICE}>No role</SelectItem>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={!email.trim() || !name.trim() || createMutation.isPending}
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Account created</DialogTitle>
          </DialogHeader>
          {created ? (
            <div className="space-y-3 text-[13.5px]">
              <p>
                <strong>{created.email}</strong> can now sign in with this temporary password.
              </p>
              <div className="rounded-md border border-[#E4E9EF] bg-[#F4F6F9] p-3 font-mono text-[13px]">
                {created.temporaryPassword}
              </div>
              <p className="text-[#7A8698]">
                Shown once and never retrievable again. They must change it on first sign-in.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(created.temporaryPassword)}
              >
                Copy password
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleTarget} onOpenChange={(open) => !open && setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change role — {roleTarget?.email}</DialogTitle>
          </DialogHeader>
          {roleTarget ? (
            <div className="space-y-4">
              <div className="text-[12.5px] leading-relaxed text-[#5F6B7C]">
                A role is a set of permissions an administrator made. Admin holds every permission and
                takes no role.
              </div>
              <div>
                <Label className="mb-1.5 text-xs font-bold">Role</Label>
                <Select value={roleChoice} onValueChange={(v) => setRoleChoice(v ?? roleChoice)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{(v: string | null) => (v ? roleName(v) : "Select a role")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {isSuperAdmin ? <SelectItem value={ADMIN_CHOICE}>Admin</SelectItem> : null}
                    <SelectItem value={NO_ROLE_CHOICE}>No role</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <RoleChangeConsequences from={choiceOf(roleTarget)} to={roleChoice} />
              {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleTarget(null)}
              disabled={roleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              disabled={roleMutation.isPending}
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
              onClick={() =>
                roleTarget && roleMutation.mutate({ target: roleTarget, choice: roleChoice })
              }
            >
              {roleMutation.isPending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * What saving will actually do, said before the click rather than discovered
 * afterwards.
 *
 * Both facts here were invisible until now. A demotion signs the person out of
 * every device — that is new, and an admin who does not expect it will read it
 * as a bug. And the employee code never changes, which is the thing people
 * assume a promotion fixes.
 */
function RoleChangeConsequences({ from, to }: { from: string; to: string }) {
  if (from === to) return null

  // Only leaving admin ends sessions; a role change reaches the person's next refresh.
  const leavingAdmin = from === ADMIN_CHOICE

  return (
    <ul className="space-y-2 rounded-md border border-[#E4E9EF] bg-[#FAFBFC] px-3.5 py-3 text-[12.5px] leading-relaxed text-[#5F6B7C]">
      <li className="flex items-start gap-2">
        {leavingAdmin ? (
          <RiLogoutBoxRLine className="mt-px size-4 shrink-0 text-[#8A5E0C]" aria-hidden />
        ) : (
          <RiTimeLine className="mt-px size-4 shrink-0 text-[#8A94A2]" aria-hidden />
        )}
        <span>
          {leavingAdmin ? (
            <>
              <strong className="font-semibold text-[#8A5E0C]">This signs them out everywhere.</strong>{" "}
              Admin access would otherwise stay live in their session until it next refreshed.
            </>
          ) : (
            <>
              They stay signed in. The new permissions reach their session when it next refreshes,
              or straight away if they sign in again.
            </>
          )}
        </span>
      </li>
    </ul>
  )
}
