# ERP Plan 3 - Original-Look Shell, Notifications, Attendance and Leave Implementation Plan

> **Superseded in part (2026-10-29).** PR A's shell and page kit (Tasks 1-3) and the nav tables in Tasks 7, 11 and 14 are replaced by an exact copy of HR-MNG-V1's UI: `AppShell` takes `navGroups`, `rootHref`, `brand`, `identity` and `onSignOut` (not `groups` and `access`); the page kit is `@erp/ui/dashboard` with the original props and tones (`green/yellow/red/neutral`), not `@erp/ui/page`; headings are `Overview`, `Workspace` and `Administration`, not `My Space`; there is no `nav/app-sidebar.tsx` or `nav/icons.ts`. The backend tasks (4-13) stand. See `2026-10-29-exact-port-ledger.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two outcomes, shipped as two PRs:
- **PR A (Tasks 1-3):** the ERP frontend looks like HR-MNG-V1: same fonts, canvas, dark sidebar, header, page headers, stat cards and tags.
- **PR B (Tasks 4-14):** employees can punch in and out, request leave and be notified. Managers and HR approve. HR configures shifts, holidays and leave types.

**Architecture:** PR A changes only `@erp/ui` and `apps/web`: a shell and a small page kit that every later module reuses. PR B adds two shared kits, `@erp/notifications` (in-app notices) and `@erp/approvals` (who may decide, and how a decision is stamped), alongside the existing `@erp/audit` and `@erp/events`. It then adds two modules: `attendance` (deps `core`, `employee`) and `leave` (deps `core`, `employee`, `attendance`, because leave counts holidays and weekly off-days from attendance's tables). Approver reach uses Plan 2's scoped permissions and `reaches`; `team` scope comes from the existing grant provider.

**Tech Stack:** as Plans 1-2. Fonts new to this app: `Public_Sans` and `Sora` from `next/font/google` (already used by HR-MNG-V1). No new npm dependencies in PR B.

**Spec:** `docs/superpowers/specs/2026-10-27-erp-monorepo-design.md` (sections 5, 7 and 8; section 6 is binding)
**Follow-ups carried in:** `docs/superpowers/plans/2026-10-27-erp-plan-2-followups.md`

## Why the UI differs today (the finding behind PR A)

`globals.css` and the font variable names are byte-identical to HR-MNG-V1, so tokens are not the gap. The look lives in HR-MNG-V1's `app/(dashboard)/*/layout.tsx` and `components/dashboard/*`, which Plan 1 did not port:
- `Public_Sans` (body, `--font-sans`) and `Sora` (headings, `--font-heading`) are loaded per dashboard layout, overriding the root `Inter`.
- Page canvas `#F4F6F9`, ink `#1C2733`, hairline `#E4E9EF`, slate text `#5F6B7C`.
- A custom `DashboardShell`: 236px dark gradient sidebar (`#17191C` to `#0B0D0F`), a header with hamburger below `lg`, notification bell and account chip, and content capped at `max-w-[1220px] 2xl:max-w-[1600px]`.
- A page kit: `PageHeader` (kicker, title, sub, CTA), `StatCard`, `Tag`, `FilterBar`, `SegmentedToggle`.

ERP currently uses stock shadcn `SidebarInset`, a plain `h-12` header and bare `<h1>` pages.

## Global Constraints

Everything in Plans 1 and 2's Global Constraints, plus:

- Git: PR A on branch `feat/ui-shell` and PR B on `feat/attendance-leave`, both from `dev`. Conventional Commits, plain ASCII, no AI attribution. Push to both remotes. Each PR has a Deploy impact section. Start PR B only after PR A is merged, or branch it from PR A's branch and say so in the PR.
- Colours and fonts follow HR-MNG-V1 (spec section 8), with the exact values from "Why the UI differs". They become tokens in `packages/ui/src/styles/globals.css` `@theme inline` (`--color-canvas`, `--color-ink`, `--color-line`, `--color-slate`, `--color-rail-from`, `--color-rail-to`), not raw hexes scattered in components.
- Port the components' structure and classes from HR-MNG-V1 `client/components/dashboard/{dashboard-shell,sidebar,header,page-header,stat-card,tag,filter-bar,filter-chip,segmented-toggle,user-avatar}.tsx`. Drop everything Sales Hub (`tone`, `systemLabel`, `accessLabel`, `SalesHubButton`, `BackToDashboardButton`) and role routing (`ROLE_ROUTES`, `guardDecision`).
- Dates are office-local (`Asia/Dhaka`). Attendance and leave dates are `@db.Date`; use `officeToday` and `formatDateOnly` from `@erp/export`. Never `new Date()` for a record's date.
- **Permissions** (finalised here; scopes as Plan 2):
  - attendance: `attendance.read` (team/department/all, managerDefault), `attendance.approve` (team/department/all, managerDefault), `attendance.manage` (department/all), `attendance.report` (team/department/all, managerDefault), `attendance.config` (on/off).
  - leave: `leave.read` (team/department/all, managerDefault), `leave.approve` (team/department/all, managerDefault), `leave.manage` (department/all), `leave.config` (on/off).
  - Punching, regularising, applying for and cancelling one's own records need no permission, only an employee record.
- **Self-approval: admins only.** A user with access level `ADMIN` or `SUPER_ADMIN` may decide a request or attendance record that belongs to their own employee record. Everyone else, including a manager or a role holder with `*.approve` at `all`, cannot (403). (User's decision. Cost: an admin's own leave has no second pair of eyes; the decision is still audited and emitted as an event, with the decider and the subject being the same person visible in both.)
- Notifications are in-app only in this plan. Email delivery arrives with the worker (Plan 7), which reads the same rows.
- Events (outbox): `attendance.approved`, `attendance.rejected`, `attendance.corrected`, `leave.requested`, `leave.approved`, `leave.rejected`, `leave.cancelled`. Declared in each manifest `events`, payload schemas in `@erp/contracts/<module>/events.ts`.
- Port behaviour from `HR-MNG-V1/server/src/modules/{attendance,leave,notification}`. Dropped: the PDF report, the mailer, the digest/auto-close/report-email jobs (Plan 7; the auto-close rule itself is built as a callable function in Task 10), the `Event` feed model (replaced by `Notification` plus the outbox), insights, anything Sales or accounting.
- Per-client module enable/disable is not part of the app. No toggle or flag.

## Review Focus

1. **Self-approval and reach.** An employee holding `leave.approve:team`, and a role holder with `leave.approve:all`, cannot approve their own request (403). A manager cannot decide a non-report's request (403). An admin or the super admin can decide their own, and the audit row and event record that. Tests in Tasks 9 and 12.
2. **Leave double-booking and balance.** A request overlapping the same person's PENDING or APPROVED request is 409. A request exceeding the balance is 409, except unpaid types. Two half-days on the same date with disjoint sessions are allowed. Tests in Task 12.
3. **Holiday maths.** The same Thursday-to-Saturday range charges 3 days for a type with `countsHolidays` and fewer for one without. A holiday added after approval does not change a stored request's charged days. Tests in Tasks 11 and 12.
4. **Punch races and the day boundary.** Two simultaneous check-ins give one row and a 409, never two rows. Check-out with no check-in is 409. A punch at 23:30 UTC lands on the next Dhaka date. Tests in Task 8.
5. **Notification privacy.** A user lists, counts and marks only their own notifications. Marking someone else's id is 404. Tests in Tasks 5 and 6.

---

## File structure

```
packages/
  ui/src/styles/globals.css                             tokens (Task 1)
  ui/src/shell/{app-shell,header,account-menu}.tsx      Task 1
  ui/src/nav/app-sidebar.tsx                            restyled (Task 1)
  ui/src/page/{page-header,stat-card,tag,tones,filter-bar,filter-chip,segmented-toggle,user-avatar,empty-state}.tsx   Task 2
  approvals/src/{index,decide}.ts                       Task 4
  notifications/src/{index,notify,query,recipients}.ts  Task 5
  contracts/src/{notification,attendance,leave}/{manifest,schemas,events,index}.ts
  db/prisma/schema/{notification,attendance,leave}.prisma
  db/src/seed/{leave-types.ts, starter-roles.ts (edit)}
apps/api/src/modules/{notification,attendance,leave}/
apps/web/{app/(app)/{attendance,leave,me}/..., modules/{notification,attendance,leave}/}
```

---

## PR A - Original-look shell

### Task 1: Tokens, fonts and the app shell

**Files:**
- Modify: `packages/ui/src/styles/globals.css`, `apps/web/app/layout.tsx`, `apps/web/app/(app)/layout.tsx`, `packages/ui/src/nav/app-sidebar.tsx`
- Create: `packages/ui/src/shell/{app-shell,header,account-menu}.tsx`, `packages/ui/src/shell/index.ts`
- Test: `packages/ui/src/shell/app-shell.test.tsx`

**Interfaces:**
- Consumes: `AppSidebar({groups, access})`, `useSession()` from `apps/web/lib/session`.
- Produces: `AppShell({ groups: NavGroup[]; access: AccessInfo; identity: { name: string; subtitle: string; avatarUrl?: string | null }; onSignOut(): void; headerSlot?: ReactNode; children })` exported from `@erp/ui/shell`. `headerSlot` is where the notification bell goes (Task 6). Sidebar width variable `--sidebar-width: 236px`.

- [ ] **Step 1: Write the failing test.** In `app-shell.test.tsx` (jsdom), assert:
  - `children` render inside a `<main>`, and there is exactly one `<main>`.
  - `headerSlot` renders.
  - The hamburger button (`aria-label="Open menu"`) has class `lg:hidden`.
  - `<main>` has class `max-w-[1220px]`.
  - The account chip shows `identity.name` and `identity.subtitle`.
  - Clicking Sign out in the account menu calls `onSignOut` once.
- [ ] **Step 2: Run** `pnpm --filter @erp/ui test` - expect FAIL (module missing).
- [ ] **Step 3: Add tokens** to `@theme inline` in `packages/ui/src/styles/globals.css`: `--color-canvas: #F4F6F9; --color-ink: #1C2733; --color-line: #E4E9EF; --color-slate: #5F6B7C; --color-rail-from: #17191C; --color-rail-to: #0B0D0F;`.
- [ ] **Step 4: Fonts.** In `apps/web/app/layout.tsx` replace `Inter` (`--font-sans`) with `Public_Sans` (weights 400-800, `--font-sans`) and replace the heading `Geist` with `Sora` (weights 600-800, `--font-heading`). Keep Geist Mono and Noto Sans Bengali. Body gets `bg-canvas text-ink`.
- [ ] **Step 5: Implement `AppShell`** by porting `dashboard-shell.tsx`, `header.tsx` (menu button, account chip with avatar, name and subtitle) and the sidebar styling (`itemClasses`, `NavBadge`, brand block, footer). `AppShell` does not fetch or know sessions: the web layout passes `identity` and `onSignOut`. Use `SidebarProvider style={{'--sidebar-width':'236px'}}`, not `SidebarInset` (a nested `<main>` is invalid). Keep Plan 2's controlled-collapsible fix in `app-sidebar.tsx`.
- [ ] **Step 6: Wire** `apps/web/app/(app)/layout.tsx` to render `AppShell`, with `identity.subtitle` = the user's role name, or `Super Admin` / `Admin` for those access levels. Keep the auth redirect and the must-change-password gate unchanged.
- [ ] **Step 7: Run** `pnpm --filter @erp/ui test && pnpm typecheck && pnpm lint` - expect PASS.
- [ ] **Step 8: Commit** `feat(ui): original look app shell, fonts and tokens`.

### Task 2: Page kit

**Files:**
- Create: `packages/ui/src/page/{page-header,stat-card,tag,tones,filter-bar,filter-chip,segmented-toggle,user-avatar,empty-state}.tsx` and `index.ts`
- Test: `packages/ui/src/page/page-kit.test.tsx`

**Interfaces:**
- Produces:
  - `PageHeader({ kicker: string; title: string; sub?: string; cta?: string; ctaHref?: string; onCta?(): void; ctaIcon?: RemixiconComponentType; aside?: ReactNode })`. `ctaHref` renders a link-styled button (ERP actions are real routes), `onCta` a button, neither means no button.
  - `StatCard({ label: string; value: string | number; hint?: string; tone?: Tone; icon?: RemixiconComponentType; href?: string })`.
  - `type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info'`, `tones: Record<Tone, { bg: string; color: string }>` (copy the values from HR-MNG-V1 `components/dashboard/types.ts`), and `Tag({ label: string; tone: Tone })`.
  - `FilterBar`, `FilterChip`, `SegmentedToggle`, `UserAvatar({ name: string; avatarUrl?: string | null; className?: string })` (initials fallback), `EmptyState({ title: string; body?: string; action?: ReactNode })`.

- [ ] **Step 1: Write the failing tests** in `page-kit.test.tsx`:
  - `PageHeader` with no `cta` renders no button.
  - `PageHeader` with `ctaHref="/x"` renders an `<a href="/x">`.
  - `PageHeader` with `onCta` fires it once on click.
  - `Tag` applies each tone's `bg` and `color` from `tones`.
  - `tones` has all five keys.
  - `UserAvatar` with no `avatarUrl` shows `AR` for "Amina Rahman".
  - `StatCard` with `href` is a link, without it is not.
- [ ] **Step 2: Run** `pnpm --filter @erp/ui test page-kit` - expect FAIL.
- [ ] **Step 3: Implement** by porting the HR-MNG-V1 files named in Global Constraints. Fixed by this plan: the stat card sizes off its own box with container queries, uses the tinted shadow `shadow-[0_8px_24px_-12px_rgba(28,39,51,0.20)]`, and tints its icon only when the tone is not `neutral`.
- [ ] **Step 4: Run** the test, typecheck and lint - expect PASS.
- [ ] **Step 5: Commit** `feat(ui): page kit (header, stat card, tag, filters)`.

### Task 3: Adopt the kit and compare with the original

**Files:**
- Modify: every page under `apps/web/app/(app)/**` and every `apps/web/modules/**/components/*` that renders its own `<h1>`; `packages/ui/src/components/data-table.tsx` (header row, row hover, empty state and pager classes to match HR-MNG-V1 `components/dashboard/data-table.tsx`); `apps/web/app/(app)/dashboard/page.tsx`.

- [ ] **Step 1:** Replace each page's heading block with `PageHeader` (kicker = module name, e.g. `EMPLOYEES`). Replace status badges with `Tag` and the tone mapping from `labels.ts`. Replace empty text with `EmptyState`.
- [ ] **Step 2:** Dashboard Overview: `PageHeader` with a greeting and no widgets (Plan 6 adds them).
- [ ] **Step 3: Browser check** with Playwright at 1440 and 390 px. Sign in to ERP (dev DB `admin@example.com`) and to HR-MNG-V1 (`pnpm dev` in `HR-MNG-V1`, its seeded HR admin). Screenshot the Employees list, a profile and a form in each. Compare sidebar colour, fonts, header height, page header and table. Fix differences; list any intentional ones in the PR body.
- [ ] **Step 4: Run** `pnpm build && pnpm lint && pnpm typecheck && pnpm test` - expect all green, with the test count at least 360.
- [ ] **Step 5: Commit** `feat(web): adopt page kit on existing pages`, push to both remotes, open PR A into `dev` (Deploy impact: none, frontend only).

---

## PR B - Notifications, attendance and leave

### Task 4: `@erp/approvals`

**Files:**
- Create: `packages/approvals/{package.json,tsconfig.json,tsconfig.build.json,src/index.ts,src/decide.ts}`
- Test: `packages/approvals/src/decide.test.ts`

**Interfaces:**
- Produces:
  - `type DecisionStatus = 'PENDING' | 'APPROVED' | 'REJECTED'`.
  - `assertPending(status: string): void` throws `AppError(409, 'This request has already been decided')`.
  - `assertMayDecide(args: { actorEmployeeId: string | null; actorIsAdmin: boolean; subjectEmployeeId: string; reaches(subjectEmployeeId: string): boolean }): void` throws `AppError(403, 'You cannot decide your own request')` when the ids are equal and `!actorIsAdmin`, and `AppError(403, 'You cannot decide this request')` when `!reaches(subjectEmployeeId)`. `actorIsAdmin` is true for access level `ADMIN` or `SUPER_ADMIN`.
  - `decisionStamp(actorUserId: string, note?: string | null, now = new Date()): { decidedBy: string; decidedAt: Date; decisionNote: string | null }`.

- [ ] **Step 1: Failing tests:** own record is 403 when `actorIsAdmin` is false, even when `reaches` is true; own record passes when `actorIsAdmin` is true; out-of-reach is 403 for a non-admin; an in-reach other person passes; `assertPending('APPROVED')` is 409 and `'PENDING'` passes; `decisionStamp` trims the note and maps blank to `null`.
- [ ] **Step 2: Run** `pnpm --filter @erp/approvals test` - FAIL. **Step 3: Implement** in `decide.ts`. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(approvals): shared decision rules`.

### Task 5: `@erp/notifications` kit and schema

**Files:**
- Create: `packages/db/prisma/schema/notification.prisma`, migration `20261029090000_notification`, `packages/notifications/{package.json,tsconfig.json,tsconfig.build.json,src/{index,notify,query,recipients}.ts}`
- Test: `packages/notifications/src/{notify,query,recipients}.test.ts` (against `erp_test`)

**Interfaces:**
- Schema: `Notification { id uuid; userId -> User; type String; title String; body String?; href String?; entity String?; entityId String?; readAt DateTime?; createdAt DateTime; @@index([userId, readAt, createdAt]) }`.
- Produces:
  - `notify(tx: Tx, input: NotifyInput | NotifyInput[]): Promise<void>`, with `NotifyInput = { userId; type; title; body?; href?; entity?; entityId? }`. It skips a duplicate of the same `(userId, type, entity, entityId)` created in the last minute.
  - `listNotifications(userId, { cursor?, limit?, unreadOnly? }): Promise<{ items: NotificationItem[]; nextCursor: string | null }>` (limit default 20, max 100).
  - `unreadCount(userId): Promise<number>`, `markRead(userId, id): Promise<void>` (404 if not theirs), `markAllRead(userId): Promise<number>`.
  - `approverUserIds(tx, employeeId, permission: string): Promise<string[]>`: the employee's reporting manager's user if active; otherwise every active `ADMIN`/`SUPER_ADMIN` plus active standard users whose role holds `permission` at `all`. Never includes the employee's own user. (My call.)

- [ ] **Step 1: Failing tests:**
  - `notify` writes one row per input; the same input twice within a minute writes one.
  - `listNotifications` returns only that user's rows, newest first, and pages with `nextCursor`.
  - `markRead(userB, idOfUserA)` rejects 404 and leaves `readAt` null (Review Focus 5).
  - `unreadCount` ignores read rows and other users' rows.
  - `approverUserIds` returns the active manager, falls back to admins when the manager is inactive or absent, and never returns the employee's own user.
- [ ] **Step 2: Run** - FAIL. **Step 3:** write the schema, generate the migration with the CLAUDE.md procedure (never `migrate dev`), run `pnpm db:deploy` and `pnpm db:test:prepare`, then implement. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(notifications): in-app notification kit`.

### Task 6: Notification module (api and bell)

**Files:**
- Create: `packages/contracts/src/notification/{manifest,schemas,index}.ts` (module `notification`, deps `['core']`, no permissions, `nav: []`), `apps/api/src/modules/notification/notification.routes.ts`, `apps/web/modules/notification/{api.ts,hooks.ts,components/notification-bell.tsx}`
- Modify: `packages/contracts/src/registry.ts`, `apps/api/src/modules/index.ts`, `apps/web/app/(app)/layout.tsx` (bell into `headerSlot`), the `erp/module-deps` folder lists in `packages/config-eslint` usage for api and web
- Test: `apps/api/src/modules/notification/notification.routes.test.ts`, `apps/web/modules/notification/notification-bell.test.tsx`

**Interfaces:** `GET /api/notifications?cursor&limit&unreadOnly`, `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`. All need sign-in only and scope to `req.user.sub`.

- [ ] **Step 1: Failing tests:** 401 when unauthenticated; list returns own only; `:id/read` on another user's id is 404; `read-all` returns the count it changed; the bell shows the unread count (label `9+` above nine), opens a list, and clicking an item marks it read and navigates to its `href`; the bell polls `unread-count` every 60 s.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement** routes using Task 5's functions; port the bell from HR-MNG-V1 `notification-bell.tsx` onto the new endpoints. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(notification): api and header bell`.

### Task 7: Attendance contracts, schema, shifts and holidays

**Files:**
- Create: `packages/contracts/src/attendance/{manifest,schemas,events,index}.ts`, `packages/db/prisma/schema/attendance.prisma`, migration `20261029100000_attendance`, `apps/api/src/modules/attendance/{shift.service,holiday.service,config.routes}.ts` (with import/export through `@erp/export`)
- Modify: `packages/db/prisma/schema/employee.prisma` (add nullable `shiftId` and relation), `packages/contracts/src/employee/{fields,schemas}.ts` (`shiftId` in `HR_EDITABLE_FIELDS` and in `EmployeeView.employment`), the employee form (shift select), `packages/db/src/seed/starter-roles.ts`, `apps/web/lib/nav.ts`
- Test: `shift.service.test.ts`, `holiday.service.test.ts`, `config.routes.test.ts`, `apps/web/lib/nav.test.ts`

**Interfaces:**
- Models ported from HR-MNG-V1 (`Shift`, `Holiday`, `HolidayType`, `Attendance`, `AttendanceApproval`, `AttendanceSource` without RFID/FACE/FINGERPRINT, `AttendanceAudit`), keeping the comments that explain a rule. `Attendance` is `@@unique([employeeId, date])`.
- Routes (`attendance.config` unless noted): `GET/POST/PATCH/DELETE /api/attendance/shifts`, `GET/POST/PATCH/DELETE /api/attendance/holidays` (`GET` is open to any signed-in user, because leave needs it), holiday and shift import and export. Writes are audited with `@erp/audit`.
- Manifest nav group `Attendance` (order 40):

  | Item | Route | Permission |
  |---|---|---|
  | Today | `/attendance` | `attendance.read:team` |
  | Approvals | `/attendance/approvals` | `attendance.approve:team` |
  | Manual Entry | `/attendance/manual` | `attendance.manage:department` |
  | Reports | `/attendance/reports` | `attendance.report:team` |
  | Shifts | `/attendance/shifts` | `attendance.config` |
  | Holidays | `/attendance/holidays` | `attendance.config` |

  The `My Space` group gains `My Attendance` at `/me/attendance` (permission `null`). `apps/web/lib/nav.ts` merges groups that share a label, ordered by the lowest `order`.
- Starter roles: HR Admin gets every attendance permission at `all`. The `Employee` role gets none.

- [ ] **Step 1: Failing tests:**
  - Overlapping dated shift overrides are rejected with 409; a dated shift wins over the default inside its window.
  - A duplicate holiday `(date, name)` is 409; a same-date, different-name pair is allowed; a `WORKING_DAY` holiday is accepted.
  - A holiday or shift import with a bad row writes nothing.
  - Users without `attendance.config` get 403 on writes and 200 on holiday `GET`.
  - `nav.test.ts`: two manifests contributing `My Space` produce one group containing both items.
- [ ] **Step 2: Run** - FAIL. **Step 3:** schema, migration, services, routes, manifest, registry entry, seed grants. **Step 4: Run** `pnpm test` for api, contracts, db and web - PASS.
- [ ] **Step 5: Commit** `feat(attendance): shifts and holidays`.

### Task 8: Punching and my attendance

**Files:**
- Create: `apps/api/src/modules/attendance/{attendance.time,attendance.punch,attendance.mine.routes}.ts`
- Test: `attendance.time.test.ts`, `attendance.punch.test.ts`, `attendance.mine.routes.test.ts`

**Interfaces:**
- Port `computeIsLate(instant, shift)`, `computeIsEarlyOut(instant, recordDate, shift)` and the time helpers from HR-MNG-V1 `attendance.time.ts` and `attendance.punch.ts`.
- `checkIn(userId: string): Promise<PunchResult>`, `checkOut(userId: string): Promise<PunchResult>`, `shiftFor(employeeId: string, date: Date): Promise<Shift>` (the employee's shift, a dated override first, else a built-in 09:00-18:00 default when none is assigned).
- Routes (sign-in plus an employee record): `POST /api/attendance/check-in`, `POST /api/attendance/check-out`, `GET /api/attendance/me?month=YYYY-MM`.

- [ ] **Step 1: Failing tests:**
  - Check-in creates a `PENDING` row with `isLate` per the shift's grace.
  - A second check-in is 409.
  - Two concurrent check-ins (`Promise.all`) leave one row (Review Focus 4).
  - Check-out without check-in is 409.
  - Check-out computes `workedHours` and `isEarlyOut`.
  - A punch at `2026-03-01T23:30:00Z` records date `2026-03-02`.
  - A user without an employee record gets 403.
  - `GET me` returns only the caller's month.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement**, relying on the unique index and mapping `P2002` to 409. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(attendance): punch in and out`.

### Task 9: Approvals, regularising and corrections

**Files:**
- Create: `apps/api/src/modules/attendance/{attendance.approval,attendance.regularise,attendance.corrections,attendance.routes}.ts`
- Test: matching `.test.ts` files

**Interfaces:**
- Consumes: `assertMayDecide`, `assertPending`, `decisionStamp` (Task 4); `can`/`scopeFor` from `@erp/auth` and `reaches` from `employee.access`; `notify`, `approverUserIds` (Task 5); `emit`; `writeAudit`.
- Produces routes:
  - `GET /api/attendance/approvals?status&date` (`attendance.approve`, rows limited to the scope).
  - `POST /api/attendance/:id/approve` and `/reject` (reject needs a note).
  - `POST /api/attendance/bulk-decide { ids, decision, note? }`.
  - `POST /api/attendance/regularise { date, checkIn?, checkOut?, note }` (own record; sets `regularisedAt` and puts the status back to `PENDING`).
  - `POST /api/attendance/manual` and `PATCH /api/attendance/:id` (`attendance.manage`; each writes an `AttendanceAudit` row with before and after in the same transaction).
  - `GET /api/attendance?date` (`attendance.read`, scoped).
- `exceptionsFor(day)` ported (LATE, EARLY_OUT, MISSING_CHECKOUT, AUTO_CLOSED and the rest of the source's codes).

- [ ] **Step 1: Failing tests:**
  - A manager approves a report's record: 200, stamps `decidedBy/At`, emits `attendance.approved`, notifies the employee.
  - A manager on a non-report's record gets 403.
  - An employee holding `attendance.approve:team`, or a role holder with `attendance.approve:all`, on their own record gets 403; an admin and the super admin can approve their own (Review Focus 1).
  - Deciding twice is 409; rejecting without a note is 400.
  - `bulk-decide` with a mix of reachable and unreachable ids decides only the reachable ones and reports each.
  - Regularising own record sets `PENDING` and `regularisedNote`, and notifies the approvers.
  - A correction writes an audit row whose `before` holds the old times.
  - `attendance.read:team` lists only direct reports.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement**, filtering by scope with Plan 2's `scopeWhere` pattern. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(attendance): approvals, regularisation and corrections`.

### Task 10: Attendance reports and auto-close rule

**Files:**
- Create: `apps/api/src/modules/attendance/{attendance.summary,attendance.grid,attendance.report,attendance.autoclose}.ts`
- Test: matching `.test.ts` files

**Interfaces:**
- `monthlySummary(scope: ScopeFilter, month: string)` and `dailyGrid(scope: ScopeFilter, month: string, leaveDaysFor?: (employeeIds: string[], month: string) => Promise<Map<string, Set<string>>>)`. Cells are present/late/absent/leave/holiday/off. `leaveDaysFor` defaults to none; Task 13 injects it.
- `GET /api/attendance/report?month&departmentId` and `GET /api/attendance/report/export?format=` (`attendance.report`, scoped, audited through `sendExport`).
- `closeOpenDays(onDate: Date, now = new Date()): Promise<number>` writes the shift end as `checkOut`, sets `autoCheckOutAt`, and returns the rows closed. It is not scheduled until Plan 7.

- [ ] **Step 1: Failing tests:**
  - A month with one holiday and the weekly off-days counts neither as absent.
  - A team-scoped viewer's report omits non-reports.
  - Export writes one `EXPORT` audit row.
  - `closeOpenDays` closes only rows with a check-in and no check-out for that date, sets `autoCheckOutAt`, leaves `source` unchanged, and returns 0 when run a second time.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement**, porting the behaviour and test cases of HR-MNG-V1 `attendance.summary.ts` and `attendance.grid.ts`. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(attendance): reports and auto-close rule`.

### Task 11: Leave contracts, schema, policy and day maths

**Files:**
- Create: `packages/contracts/src/leave/{manifest,schemas,events,index}.ts`, `packages/db/prisma/schema/leave.prisma`, migration `20261029110000_leave`, `packages/db/src/seed/leave-types.ts`, `apps/api/src/modules/leave/{leave.dates,leave.policy,leave.accrual}.ts`
- Test: `leave.dates.test.ts`, `leave.policy.test.ts`, `leave.accrual.test.ts`

**Interfaces:**
- Models `LeaveType`, `LeaveBalance` (`@@unique([employeeId, leaveTypeId, year])`), `LeaveRequest`, and enums `LeaveAccrualBasis`, `LeaveStatus`, `LeaveSession`, ported with their comments. `LeaveRequest` carries `decidedBy` (user id, replacing `approvedBy`), `decidedAt` and `decisionNote`.
- `countChargedDays(args: { start: Date; end: Date; startSession: LeaveSession; endSession: LeaveSession; countsHolidays: boolean; weeklyOffDays: number[]; holidays: Date[]; workingDayOverrides: Date[] }): number`, in steps of 0.5.
- `entitlementFor`, `computeEntitlement` and accrual per `LeaveAccrualBasis`, ported from HR-MNG-V1 `leave.service.ts` and `leave.accrual.ts`. `seedLeaveTypes()` is ported from the HR-MNG-V1 seed (Bangladesh Labour Act 2006 defaults); only rows with `statutory = true` are rewritten.
- Manifest nav group `Leave` (order 50):

  | Item | Route | Permission |
  |---|---|---|
  | Apply Leave | `/leave/apply` | `null` (employee record) |
  | Leave Requests | `/leave/requests` | `leave.read:team` |
  | Approvals | `/leave/approvals` | `leave.approve:team` |
  | Team Status | `/leave/team` | `leave.read:team` |
  | Leave Types | `/leave/types` | `leave.config` |

  The `My Space` group gains `My Leave` at `/me/leave`.

- [ ] **Step 1: Failing tests** (port the cases from HR-MNG-V1 `leave.dates.test.ts` and `leave.accrual.test.ts`, then add):
  - A Thursday-to-Saturday range with Friday as the weekly off-day and Saturday a holiday charges 3 for a `countsHolidays` type and 1 otherwise (Review Focus 3).
  - Half-day start and end sessions give `x.5`.
  - A `WORKING_DAY` override on a Friday charges that Friday.
  - Earned leave gives nothing before `minServiceMonths`.
  - Maternity is never pro-rated.
  - The seed is idempotent and does not overwrite a non-statutory row HR edited.
- [ ] **Step 2: Run** - FAIL. **Step 3:** schema, migration, `pnpm db:deploy`, implement. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(leave): schema, policy and day counting`.

### Task 12: Leave requests and decisions

**Files:**
- Create: `apps/api/src/modules/leave/{leave.service,leave.admin,leave.routes}.ts`
- Test: `leave.service.test.ts`, `leave.admin.test.ts`, `leave.routes.test.ts`

**Interfaces:**
- Consumes: Tasks 4, 5 and 11; `emit`; `writeAudit`.
- Routes:
  - `GET /api/leave/types` (any signed-in user), `GET /api/leave/balances/me`, `GET /api/leave/balances/:employeeId` (`leave.read`, scoped).
  - `POST /api/leave/requests`, `GET /api/leave/requests?scope=mine|team` (`leave.read`, scoped).
  - `POST /api/leave/requests/:id/approve` and `/reject` (`leave.approve`; reject needs a note).
  - `POST /api/leave/requests/:id/cancel` (the owner while PENDING, or `leave.manage` for an approved future request).
  - `POST /api/leave/requests/:id/revert` (`leave.manage`).
  - `GET /api/leave/team-status` (`leave.read:team`).
  - Leave type CRUD and balance adjustment (`leave.config`).
- `applyForLeave(userId: string, input: ApplyLeaveInput): Promise<LeaveRequestItem>` validates `eligibleFor`, half-day only when `allowsHalfDay`, backdating only when `allowsBackdating`, `maxConsecutive`, overlap and balance. It notifies `approverUserIds(tx, employeeId, 'leave.approve')` and emits `leave.requested`.

- [ ] **Step 1: Failing tests** (port from HR-MNG-V1 `leave.service.test.ts` where they apply, then add):
  - An overlapping PENDING or APPROVED request is 409.
  - Two half-day requests on one date with disjoint sessions are allowed.
  - Exceeding the balance is 409, but an unpaid type is allowed.
  - A backdated request for a type without `allowsBackdating` is 400.
  - Approve updates `used` and `balance` in the same transaction as the status change, stamps via `decisionStamp`, notifies the employee and emits `leave.approved`.
  - Self-approval is 403 for an employee, a manager and a role holder with `leave.approve:all`; it succeeds for an admin and the super admin, and the emitted `leave.approved` event carries the same user as decider and subject. A non-report is 403 for a manager (Review Focus 1).
  - Approving twice is 409.
  - Cancelling an approved request restores the balance; so does revert.
  - A holiday added after approval leaves the stored request's charged days unchanged (Review Focus 3).
  - `team-status` lists who is on leave today within the viewer's scope.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement.** Mutate the balance inside `prisma.$transaction` with an atomic guarded `updateMany` (`balance >= days`), so two concurrent approvals cannot overdraw. **Step 4: Run** - PASS.
- [ ] **Step 5: Commit** `feat(leave): requests, decisions and team status`.

### Task 13: Leave in the attendance grid, and starter grants

**Files:**
- Modify: `apps/api/src/modules/attendance/attendance.grid.ts` (uses the `leaveDaysFor` argument from Task 10), `apps/api/src/modules/index.ts` (wires leave's day lookup into attendance, so `attendance` never imports `leave`), `packages/db/src/seed/starter-roles.ts`, `packages/db/src/seed/grant-new-permissions.ts`
- Test: `attendance.grid.test.ts`, `starter-roles.test.ts`

- [ ] **Step 1: Failing tests:** an approved leave day shows as `leave` in the grid, a pending one does not; HR Admin's starter role holds every leave permission at `all`; `grant-new-permissions` is idempotent.
- [ ] **Step 2: Run** - FAIL. **Step 3: Implement.** **Step 4: Run** `pnpm test` - PASS.
- [ ] **Step 5: Commit** `feat(leave): show leave in the attendance grid`.

### Task 14: Web pages, browser check, docs and PR

**Files:**
- Create: `apps/web/modules/{attendance,leave}/{api.ts,hooks.ts,components/*}`; pages `apps/web/app/(app)/attendance/{page,approvals,manual,reports,shifts,holidays}`, `apps/web/app/(app)/leave/{apply,requests,approvals,team,types}`, `apps/web/app/(app)/me/{attendance,leave}`
- Modify: `packages/ui/src/nav/icons.ts` (every icon the manifests name), `CLAUDE.md` (kits, nav merge, no-self-approval rule)
- Create: `docs/superpowers/plans/2026-10-28-erp-plan-3-followups.md`
- Test: component tests for the punch card, the leave apply form and the approvals table

**Interfaces:** every page uses `PageHeader`, `StatCard`, `Tag`, `DataTable`, `ExportMenu` and `ImportWizard` from `@erp/ui`. The month stepper goes in `PageHeader`'s `aside`. `/me/attendance` shows a punch card with today's state and one large button.

- [ ] **Step 1: Failing component tests:**
  - Punch card: shows Check in with no punch today, Check out after check-in, and disables the button after check-out.
  - Leave apply form: previews charged days for the chosen range and sessions, and disables submit when the balance is short.
  - Approvals table: supports bulk select, and reject requires a note.
- [ ] **Step 2: Run** - FAIL. **Step 3:** implement the pages and hooks. **Step 4: Run** - PASS.
- [ ] **Step 5: Browser check** (Playwright, dev DB; Amina manages Bilal):
  - Bilal punches in, applies for two days of casual leave and sees the charged-days preview.
  - Amina's bell shows two notifications; she approves the leave and the attendance record.
  - Bilal's bell shows both, and his balance dropped.
  - Amina cannot approve her own leave.
  - The admin's Reports grid shows Bilal's leave day.
  - Screenshot the attendance and leave pages beside HR-MNG-V1 at 1440 px.
- [ ] **Step 6: Full run** `pnpm build && pnpm lint && pnpm typecheck && pnpm test` - all green; record the test count in the ledger.
- [ ] **Step 7: Commit**, push to both remotes, and open PR B into `dev` with What, Tests and Deploy impact (`pnpm db:deploy` then `pnpm db:seed`; three new migrations; employees gain a nullable `shiftId`).

---

## Self-review notes

- **Spec coverage (sections 5 and 8):** attendance (check-in/out, regularise, approvals, shifts, holidays, reports; jobs deferred to Plan 7 with the auto-close rule built), leave (types, balances, requests, accrual, team status, half-day), the notification kit, and the shell and sidebar look. Not here by design: payslip PDF, mailers and the worker (Plans 5 and 7), insights.
- **Type consistency:** `decisionStamp`, `assertMayDecide` and `assertPending` (Task 4) are the only names Tasks 9 and 12 use; `notify` and `approverUserIds` (Task 5) likewise; `AppShell`'s `headerSlot` (Task 1) is what Task 6 fills; `dailyGrid`'s `leaveDaysFor` (Task 10) is what Task 13 supplies.
- **Boundaries:** `attendance` never imports `leave` (Task 13 injects), `leave` depends on `attendance` (declared in its manifest), `notification` depends on `core` only.
- **Proportion:** the plan states interfaces, values and test assertions; bodies are left to the implementer, and ported behaviour points at HR-MNG-V1 files rather than restating them.
