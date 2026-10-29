# ERP Plan 4 - Everything Remaining (old Plans 4 to 7 combined) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the ERP as an exact copy of HR-MNG-V1 (everything except accounting and the Sales Hub): the rest of the exact port for attendance, leave and people; expense, asset, cost and depreciation; payroll and settlement; announcements, events, dashboard; then the worker, Swagger and Docker.

**Architecture:** Unchanged from Plans 1 to 3 and the exact-port ledger. Every module is a manifest in `@erp/contracts`, a Prisma schema file, an Express module in `apps/api`, and a module folder in `apps/web` that holds copied HR-MNG-V1 components behind one `api.ts` adapter. Anything two modules need goes in a shared package (`@erp/pdf` and `@erp/mail` are new). Ledger posting that HR-MNG-V1 does inside payroll, expense, settlement, asset, cost and depreciation becomes an outbox event (`emit(tx, type, payload)`); nothing delivers them until the worker lands in Part E.

**Tech Stack:** As Plans 1 to 3. New dependencies (exact versions, all already used by HR-MNG-V1): `puppeteer` (PDF), `nodemailer` (mail), `node-cron` (worker), `swagger-ui-express` (API docs).

**Spec:** `docs/superpowers/specs/2026-10-27-erp-monorepo-design.md` (sections 5, 6, 7, 8, 10, 11, 12)
**Ledger (binding):** `docs/superpowers/plans/2026-10-29-exact-port-ledger.md`
**Follow-ups carried in:** `2026-10-27-erp-plan-1-followups.md`, `2026-10-27-erp-plan-2-followups.md`, `2026-10-28-erp-plan-3-followups.md`

**This plan replaces items 4 to 7 of the "Plan series" in Plan 1.** Mapping: old 4 = Part B, old 5 = Part C, old 6 = Part D, old 7 = Part E. Part A is the exact-port work the ledger still owes for modules already built.

## Decisions to confirm before Part A starts

These are my calls; each says what changes if you disagree.

1. **PDF needs Puppeteer and a Chromium download.** HR-MNG-V1 renders attendance reports, payslips and the expense report in headless Chrome. Task A1 adds `@erp/pdf` with it. If refused, those three downloads stay CSV-only or answer 501. Affects Tasks A1, B2, C3.
2. **Cost and depreciation are in scope.** The ledger lists them (the sidebar's "Expenses" is costs; the finance area has "Depreciation" and "Asset value"). Spec section 5 does not list them; I add them as modules with posting replaced by events. If you disagree, drop Tasks B5 and B6 and their sidebar items.
3. **One PR per Part (A to E)**, each from `dev` and merged before the next starts, instead of one PR. Plan 3 as one PR reached 255 files. Say so if you want a single PR anyway.
4. **The dashboard is composed per permission** from HR-MNG-V1's own dashboard section components, instead of five role dashboards (spec section 5). The components are copied unchanged; only which ones show depends on permissions.

## Port rules (carried unchanged from the ledger)

- **Copy, do not write.** Take the file from `HR-MNG-V1/client/components/<area>` and `HR-MNG-V1/server/src/modules/<module>`. Allowed edits: import paths and the data layer underneath. No renamed props, no restyled markup, no new components, no reworded copy.
- **Out of scope, never ported:** `components/accounting`, `sales`, `statements`, `posting`; routes for accounting, statements, posting rules, customers, suppliers, deals, journals; the server modules `dealMoney`, `receivables`, `supplierBill`, `vatCode`; the VAT panel in settings; the Sales Hub access flag; the two sales jobs. From `components/money`, port only what payroll, expense and cost import.
- **Employee and admin sides are separate pages.** HR-MNG-V1 `/employee/<x>` becomes `/me/<x>`; HR-MNG-V1 `/admin/<x>` becomes the module route `/<x>`. Routes are per module, not per role (spec section 8).
- **Sidebar:** HR-MNG-V1's own `Sidebar`. An item whose original page stacks several sections becomes a collapsible item with one child page per section; each child renders that section's original component unchanged. This is the only deliberate difference. Heading labels are the original's own from each area's `nav-config.ts` (admin side: `Overview`, `Payroll & finance`, `Administration`; personal pages: `Workspace`, `Account`); headings with the same label merge across modules. Manifest shape `{ label, order, items:[{ label, href, icon, permission, children? }] }`; icons come from `packages/ui/src/dashboard/icons.ts`.
- **Permissions replace roles, and there are two points of view.** Where HR-MNG-V1 checks `role`, ERP uses `requirePermission` and `scopeFor`/`reaches`. Port only the employee pages (`/me/...`) and the admin pages (module routes); the original's `hr/*`, `finance/*` and `manager/*` variants (including `manager/team`) are not ported, because there is one admin who sees all of those routes combined; permissions are handed out later and the roles and permissions already built are not changed until then (owner, 2026-10-29).
- **Data layer:** keep ERP's API and tests; wire the copied screens through one adapter `apps/web/modules/<module>/api.ts` that keeps the original's call signatures (including the ignored token argument), as attendance already does.
- **Types once:** wire types live in `@erp/contracts/<module>/types.ts`; `apps/web/modules/<module>/types.ts` re-exports them.
- **Porting tool:** the Plan 3 rewrite rules (`@/components/dashboard/*` to `@erp/ui/dashboard`, `@/components/ui/*` to `@erp/ui/components/*`, `@/lib/utils` to `@erp/ui/lib/cn` or `@erp/ui/lib/dates`, `@/lib/api/types` to `../types`, `@/lib/api/<module>` to `../api`, `ApiError` to `@erp/utils`, session to `@/lib/session`). The script stays outside the repo in the session scratchpad; recreate it from this list if the scratchpad is gone.

## Global Constraints

Everything in Plans 1 to 3 and the ledger, plus:

- Git: one work branch per Part from `dev` (`feat/exact-port-people`, `feat/expense-asset`, `feat/payroll-settlement`, `feat/announce-dashboard`, `feat/worker-docker`). Conventional Commits, at most 72 characters, plain ASCII, no AI attribution. Push to `origin` then `reza`; PR into `dev`; every PR has a `Deploy impact:` line. Never force-push `main` or `dev`. Run the push and PR steps directly.
- Money is `Decimal`/string end to end. Reuse the ported helpers (`dec`, `toMoneyString`) from `@erp/utils`; never `Number` for an amount. FX is applied where HR-MNG-V1 applies it (expense at approval, payroll at process).
- Dates are office-local (`Asia/Dhaka`), `@db.Date`; use `officeToday` and `formatDateOnly` from `@erp/export`.
- Self-decision: only `ADMIN` and `SUPER_ADMIN` may decide their own expense claim, asset request, payroll run or settlement; everyone else gets 403. Use `@erp/approvals`.
- Migrations: the CLAUDE.md recipe (`migrate diff`, never `migrate dev`, keep the `one_super_admin` index), one migration per module.
- Every mutation writes an audit row (`@erp/audit`) in the same transaction as the change, and every event type is listed in the owning manifest's `events`.
- Permissions are declared per manifest with `{ label, scopes?, managerDefault? }`; keys unique across modules. Starter grants go in `packages/db/src/seed/starter-roles.ts` (HR-MNG-V1 Admin, Finance Officer, Employee).
- Dev run: Docker Postgres on 5433 (`pnpm services:up`), ERP on web 3100 and API 4100 (HR-MNG-V1 containers hold 3000 and 4000), login `admin@example.com` / `change-me-now`.
- Done means: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` pass, and the new pages were opened in a browser against the dev database. Test commands below run one file: `pnpm --filter @erp/<pkg> exec vitest run <file>`.

## The recipe every port task follows

Tasks below name only what is specific to the module. Each task's steps expand to this:

1. **Contracts and schema:** manifest (`permissions`, `nav`, `events`, `deps`), `schemas.ts`, `types.ts` (copied from HR-MNG-V1 `*.types.ts`), register in `registry.ts`; Prisma models ported from HR-MNG-V1 `schema.prisma` minus accounting columns; migration by the CLAUDE.md recipe; starter grants; `pnpm db:generate`.
2. **API port, test first:** copy HR-MNG-V1 `*.test.ts` for the module, replace role fixtures with permission/scope fixtures, run and see FAIL; then copy the service/calc/validators, replace roles with `scopeFor`, `posting` calls with `emit(tx, ...)`; PASS. Routes in `<module>.routes.ts` guarded by `requirePermission`, mounted in `apiMounts`.
3. **Web port:** copy components with the port rules, write the `api.ts` adapter, keep pages under `app/(app)/...` thin, add the sidebar entry in the manifest, copy component tests where HR-MNG-V1 has them.
4. **Browser check** on 3100/4100 as the admin and as a seeded Employee-role user: every page loads, one create-edit-decide round trip works, console clean.
5. **Commit** per task.

## Review Focus

Inputs the spec implies but the main flows do not exercise. Each has a named test in its owning task.

1. **Two people process the same payroll period at once.** One run per period; the loser gets 409, no duplicate payslips (C2).
2. **Another employee's payslip, claim, settlement or asset by id.** Out of scope returns 404, neither the data nor a 403 that confirms it exists (B1, B3, C3, C4).
3. **Amount rounding.** Three claims of 33.33 total 99.99 exactly; FX conversion keeps 6dp; a payslip total equals the sum of its lines (B1, C2).
4. **The same outbox event delivered twice.** One side effect (E1).
5. **Exit details after a settlement is approved.** The employee's exit fields are frozen (409 on edit); rejecting the settlement unfreezes (C4).

---

# Part A - Finish the exact port for what is already built (ledger stages 2 to 5)

### Task A1: Shared PDF kit and the attendance PDF report

**Files:**
- Create: `packages/pdf/{package.json,src/index.ts,src/html-to-pdf.ts,src/html-to-pdf.test.ts}`
- Modify: `apps/api/src/modules/attendance/attendance.routes.ts` (report route), `attendance.report.ts` (add `reportToHtml`), `apps/web/modules/attendance/components/report-panel.tsx` (the "PDF unavailable" branch only)
- Test: `apps/api/src/modules/attendance/attendance.report.routes.test.ts`

**Interfaces:**
- Produces: `htmlToPdf(html: string, opts?: { landscape?: boolean }): Promise<Buffer>` in `@erp/pdf`; one shared browser launched lazily and closed on process exit.
- Consumes: `AttendanceReport` from `@erp/contracts/attendance`.

- [ ] **Step 1: Failing tests.** `html-to-pdf.test.ts`: `htmlToPdf('<p>hi</p>')` returns a buffer starting with `%PDF`. Route test: `GET /api/attendance/report?format=pdf&from=2026-08-01&to=2026-08-01` returns 200, `Content-Type: application/pdf`, filename `attendance-summary-2026-08-01-to-2026-08-01.pdf`, and writes one `EXPORT` audit row.
- [ ] **Step 2:** Run both; expect FAIL (501 and missing package).
- [ ] **Step 3:** Add `puppeteer` 25.3.0 to `@erp/pdf`; copy HR-MNG-V1 `attendance.report.pdf.ts` as `reportToHtml(report: AttendanceReport): string` (the single-day layout differs, as in HR-MNG-V1); replace the 501 branch.
- [ ] **Step 4:** Run; expect PASS. Download the PDF in the browser and open it.
- [ ] **Step 5:** Commit `feat(pdf): shared html-to-pdf kit and attendance pdf report`.

### Task A2: Employee attendance (`/me/attendance`)

**Files:** copy the HR-MNG-V1 `components/attendance` pieces used by `app/(dashboard)/employee/attendance/page.tsx` (punch card, own month, regularise dialog, history) into `apps/web/modules/attendance/components/`; page `apps/web/app/(app)/me/attendance/page.tsx`; manifest nav item under `Workspace`, no permission.

**Interfaces:** Consumes the Plan 3 adapter (`getEmployeeAttendance` and the punch and regularise calls in `api.ts`); add any missing adapter function with the original's signature.

- [ ] **Step 1: Failing tests** (copied from HR-MNG-V1 if present): punch-in shows the check-out button; a regularise request posts `{date, checkIn, checkOut, reason}`; a day before go-live renders as not tracked.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Copy components and page; add the adapter functions.
- [ ] **Step 4:** Run; expect PASS. Browser check as the Employee-role user: punch in, punch out, regularise, then see it on the admin approvals page.
- [ ] **Step 5:** Commit `feat(attendance): exact HR-MNG-V1 employee attendance page`.

### Task A3: Leave, admin side (collapsible)

**Files:** copy the HR-MNG-V1 `components/leave` sections used by `app/(dashboard)/admin/leave/page.tsx`; pages `app/(app)/leave/<section>/page.tsx`; update `packages/contracts/src/leave/manifest.ts` nav to one collapsible `Leave` item whose children are the original page's sections in their original order. Read the HR-MNG-V1 page first and name the children after its sections; the Plan 3 table is superseded.

**Interfaces:** Adapter `apps/web/modules/leave/api.ts` keeps the signatures of HR-MNG-V1 `lib/api/leave.ts`. Server routes exist from Plan 3; add the ones HR-MNG-V1 calls that ERP lacks and list them in the commit body.

- [ ] **Step 1: Failing tests:** component tests copied from HR-MNG-V1 `components/leave`; API tests for each added route (a team manager sees only direct reports; admin sees all).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Copy components; add missing routes under `leave.read`/`leave.approve`. The leave types panel moves to Settings (Task A6).
- [ ] **Step 4:** Run; expect PASS. Browser check each child page.
- [ ] **Step 5:** Commit `feat(leave): exact HR-MNG-V1 leave sections as collapsible pages`.

### Task A4: Leave, employee side (`/me/leave`)

**Files:** copy HR-MNG-V1 `employee/leave` page components; `app/(app)/me/leave/page.tsx`; nav item under `Workspace`.

- [ ] **Step 1: Failing tests:** balance card; apply dialog honours the half-day window; cancel own pending request.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Copy and adapt imports; delete the Plan 3 fresh leave components and tests the copies replace.
- [ ] **Step 4:** Run; expect PASS. Browser check apply, cancel, balance.
- [ ] **Step 5:** Commit `feat(leave): exact HR-MNG-V1 employee leave page`.

### Task A5: Employee point of view: Profile and Directory (done), admin employees (moved)

Only two points of view exist (see the ledger), so the original's `manager/team` is not ported: a manager is anyone holding `employee.read:team`, and the admin list already covers that scope. Departments are a Settings panel in HR-MNG-V1, so they move to A6.

**Done:** `/me` is the original's `MyProfilePage` (staff) or `AccountProfile` (account with no employee record), `/me/directory` is the original's `DirectoryPage` with `ColleagueDialog`. Data layer: `apps/web/modules/employee/profile-api.ts` (HR-MNG-V1 signatures over ERP's endpoints), session and account calls in `modules/settings/api.ts`, `GET /auth/account`, `PATCH /auth/display-name` (null clears), own avatar endpoints, `SignedDocumentUrl.expiresAt`. The account-only panel "What X can do" lists the account's real permissions from the manifests (`summarizeGrants`) or "Every permission" for admin levels.

**Moved to later parts, not dropped:** admin employees list, detail and add (HR-MNG-V1 `employees-page`, `employee-detail-page`, `edit-card-dialog`, `shift-dialog`, `exit-details-dialog`, `salary-structure-dialog`, `leave-balance-card`) join Part C with salary structure; `profile-insights` and the "What you've done" feed join Part D; self change-email, the pending-email notice and the original's change-email dialog join C3 with `@erp/mail`.

- [x] **Step 1:** Failing tests first for the permission summary, clearing the display name, and the document-URL expiry; component test for the account panel.
- [x] **Step 2:** Run; RED for each.
- [x] **Step 3:** Copy, adapt imports, wire pages.
- [x] **Step 4:** Run; GREEN. Browser check as admin (account profile, edit name) and as staff (profile, edit details, directory, colleague card).
- [x] **Step 5:** Commit `feat(employee): exact HR profile and directory for the employee view`.

### Task A6: Settings (collapsible panels) and Users (done), Activity (moved to D)

Settings is one sidebar item whose children are pages; modules add their own children and same-label expandable items merge (`mergeNavGroups`). Done: `SettingsPage` shell, Departments, Shifts, Leave types panels, the original's Users page over ERP's level-and-role model. Roles stays ERP's own page. Activity is the original's events feed, so it ships with events in Part D; Resend-password ships with mail in C3. Each later module adds its Settings child with its own task: asset categories (B4), cost categories (B5), exchange rates and payroll settings (C1).

Server changes this needed, each test-first: shift update returns `{ shift, impact }`, the General shift is seeded and cannot be renamed or deleted, leave type update is partial and keeps the original's statutory floor, the users list carries `createdAt` and the linked employee.

- [x] **Steps 1-5** done; committed as `feat(settings): HR shifts and leave types panels as settings pages`, `feat(settings): HR settings shell and departments panel as a page` and the Users commit.

### Task A7: Cleanup and ledger (partly moved)

Done in Part A: removed the fresh department, shifts, leave types, users, manual-entry and My Team pages, their helpers and tests; ledger updated. **Moved:** deleting `packages/ui/src/page/**` waits for the last fresh screens that use it (admin employees list, detail and add in Part C; dashboard, Roles and Activity in D), so the check `rg "@erp/ui/page" apps packages` becomes the closing step of Part D. The leave accrual move out of `attendance.grid.ts` is left as is: the grid's output is not the original's `derive` output, and unifying them is a behaviour change, not cleanup.

- [x] Verified: `pnpm typecheck && pnpm lint && pnpm test` pass; Part A PR opened from `feat/exact-port-people`.

---

# Part B - Expense, asset, cost, depreciation (old Plan 4)

### Task B1: Expense backend

**Files:** `packages/contracts/src/expense/{manifest,schemas,types,events,index}.ts`; `packages/db/prisma/schema/expense.prisma` (`ExpenseClaim`, `ExpenseAttachment`, `ExpenseCategory`); `apps/api/src/modules/expense/{expense.routes,expense.service,expense.category.service,expense.report,expense.outstanding,expense.sweep,expense.validators}.ts` ported; receipts through `@erp/attachments`.

**Interfaces:**
- Permissions: `expense.read` (team/department/all, managerDefault), `expense.approve` (team/department/all, managerDefault), `expense.manage` (department/all; reimburse), `expense.config` (categories), `expense.report` (department/all). Creating and cancelling one's own claim needs no permission.
- Events: `expense.claim.approved`, `expense.claim.reimbursed`.
- Produces: `approveClaim(actor, id, input, tx?)` and `reimburseClaim(actor, id, input, tx?)`; other modules read claims through the shared client.
- deps: `core`, `employee`.

- [ ] **Step 1: Failing tests** (ported): create a claim; approve emits `expense.claim.approved` with the converted amount; a non-admin cannot approve their own claim (403) and an admin can; `GET /expenses/:id` outside scope is 404; three 33.33 claims sum to exactly `99.99`; a receipt upload answers 503 when storage is not configured.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement per the recipe; replace `expense.posting` with `emit` inside the decision transaction.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(expense): claims, categories and approvals with events`.

### Task B2: Expense UI (`/expenses`, `/me/expenses`) and report

**Files:** copy `components/expense` (4 files) and the `lib/api/expenses.ts` closure; pages `app/(app)/expenses/page.tsx` (collapsible only if the original admin page stacks sections; read it first), `app/(app)/me/expenses/page.tsx`; report PDF through `@erp/pdf` from HR-MNG-V1 `expense.report.pdf.ts`. Nav: `Employee expenses` under `Payroll & finance`, `Expenses` under `Workspace`.

- [ ] **Step 1: Failing tests:** copied component tests; the report route returns `application/pdf` and one `EXPORT` audit row.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Copy and wire.
- [ ] **Step 4:** Run; expect PASS. Browser check submit, approve, reimburse, report download.
- [ ] **Step 5:** Commit `feat(expense): exact HR-MNG-V1 expense screens and pdf report`.

### Task B3: Asset backend

**Files:** `packages/contracts/src/asset/**`; `packages/db/prisma/schema/asset.prisma` (`AssetCategory`, `Asset`, `AssetAssignment`, `AssetAttachment`, `AssetRequest`, `AssetRepair`, `AssetRecovery`); `apps/api/src/modules/asset/**` ported (`asset.{service,assignments,requests,repairs,recoveries,status,stage,value,access,exit,export,import,media,sweep,capitalise}.ts`, `asset.categories.seed.ts`).

**Interfaces:**
- Permissions: `asset.read` (team/department/all, managerDefault), `asset.approve` (requests; team/department/all, managerDefault), `asset.manage` (department/all; assign, return, repair, recover, retire), `asset.config` (categories). Requesting an asset and viewing one's own holdings need no permission.
- Events (spec section 11): `asset.capitalised`, `asset.disposed`, `asset.assigned`, `asset.returned`, `asset.lost`.
- Produces: `listOpenRecoveries(employeeId, tx?)` and `exitChecklist(employeeId)` for settlement.
- `capitalise`, `pay`, `dispose` keep their state change; each ledger write becomes its event.

- [ ] **Step 1: Failing tests** (ported): assign then return restores `AVAILABLE`; retiring an assigned asset is 409; a non-admin deciding their own asset request is 403; `GET /assets/:id` of an asset held outside a team manager's scope is 404; an import of three rows with one bad row writes nothing; `capitalise` emits `asset.capitalised`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement per the recipe; the category seed runs from `db:seed`.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(asset): assets, requests, repairs, recoveries with events`.

### Task B4: Asset UI

**Files:** copy `components/asset` (20 files); pages `app/(app)/assets/**` (children per section of the original `admin/assets` page; read it first), `app/(app)/me/assets/page.tsx`; the import wizard uses the existing `components/import` copies over the `@erp/export` import kit; Settings child `Asset categories`.

- [ ] **Step 1: Failing tests:** copied component tests; the adapter maps HR-MNG-V1 `assets.ts` calls to ERP routes.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Copy and wire.
- [ ] **Step 4:** Run; expect PASS. Browser check create, assign, return, request, repair, recovery.
- [ ] **Step 5:** Commit `feat(asset): exact HR-MNG-V1 asset screens`.

### Task B5: Cost backend and UI

**Files:** `packages/contracts/src/cost/**`; `packages/db/prisma/schema/cost.prisma` (`CostCategory`, `CostCommitment`, `CostAttachment`, bills); `apps/api/src/modules/cost/**` ported (`cost.{service,derive,summary,import,export,media}.ts`); copy `components/cost` (7 files); page `app/(app)/costs/page.tsx`; Settings child `Cost categories`.

**Interfaces:** Permissions `cost.read`, `cost.manage` (department/all), `cost.config`. Events `cost.bill.accrued`, `cost.bill.paid` (replacing `cost.posting`).

- [ ] **Step 1: Failing tests** (ported): a bill goes PENDING then PAID; paying twice is 409; the `isOverdue` derivation; an import is all-or-nothing; paying emits `cost.bill.paid`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement and copy the UI per the recipe.
- [ ] **Step 4:** Run; expect PASS. Browser check.
- [ ] **Step 5:** Commit `feat(cost): costs, commitments and payments with events`.

### Task B6: Depreciation and asset value

**Files:** extend `packages/contracts/src/asset/**` and `packages/db/prisma/schema/asset.prisma` (`DepreciationRun`, `AssetDepreciation`) with a migration; `apps/api/src/modules/asset/depreciation.{compute,preflight,service}.ts` ported; copy `components/depreciation` (5 files); pages `app/(app)/assets/depreciation/page.tsx` and `assets/value/page.tsx`.

**Interfaces:** Permission `asset.value` (on/off). Event `depreciation.run.finalized` (replacing `depreciation.posting`).

- [ ] **Step 1: Failing tests** (ported): the straight-line monthly amount rounds to 2dp and the final month closes book value to the salvage value exactly; preflight blocks a run while an earlier month is unposted; finalising emits `depreciation.run.finalized`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement and copy the UI.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(asset): depreciation runs and asset value`. Push to both remotes and open the PR for Part B.

---

# Part C - Payroll and settlement (old Plan 5)

### Task C1: Payroll configuration

**Files:** `packages/contracts/src/payroll/**`; `packages/db/prisma/schema/payroll.prisma` (`ExchangeRate`, `SalaryStructure`, `SalaryComponent`, `PayrollSetting`, plus `PayrollRun` and `PayrollAdjustment` for C2); `apps/api/src/modules/payroll/payroll.{settings,fx,structure.export,money,types,validators}.ts`; copy `salary-structures-page.tsx` and the exchange-rates and payroll-settings panels; page `app/(app)/payroll/salary-structures/page.tsx`; Settings children for the two panels.

**Interfaces:** Permissions `payroll.read` (department/all), `payroll.manage` (department/all), `payroll.approve` (department/all), `payroll.disburse` (all), `payroll.config` (on/off). deps: `core`, `employee`, `attendance`, `leave`, `expense`.

- [ ] **Step 1: Failing tests** (ported): a structure's components sum to basic plus allowances; an FX rate is stored at 6dp; changing a structure does not alter a processed run's snapshot; export writes an audit row.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement and copy the UI per the recipe.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(payroll): salary structures, exchange rates and settings`.

### Task C2: Payroll runs

**Files:** `apps/api/src/modules/payroll/payroll.{service,calc,preflight,bankfile,events}.ts`; copy `payroll-page.tsx`, `run-detail.tsx`, `preflight-panel.tsx`, `adjustment-dialog.tsx`, `adjustments-panel.tsx`; pages `app/(app)/payroll/**` (children per section of the original `admin/payroll` page; read it first).

**Interfaces:**
- Run lifecycle `preflight -> process -> submit -> approve -> disburse`, each a transition `transition(actor, runId, to, tx?)` guarded by `@erp/approvals`.
- Events `payroll.run.finalized` (on approve) and `payroll.run.disbursed` (on disburse); payloads in `@erp/contracts/payroll/events.ts`.
- Reads attendance through `getMonthlySummary` (the frozen payroll contract from Plan 3), leave through its service, approved expenses through `expense` service functions.

- [ ] **Step 1: Failing tests** (ported): preflight lists employees with no structure; process computes net = gross - deductions + adjustments; two concurrent `process` calls for one period leave one run and one 409 (Review Focus 1); a payslip total equals the sum of its lines (Review Focus 3); a non-admin who processed a run cannot approve it (403); the bank file has one row per payee with the exact total.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement; take a transaction-scoped advisory lock keyed on the period for `process`.
- [ ] **Step 4:** Run; expect PASS. Browser check a full run on seeded data.
- [ ] **Step 5:** Commit `feat(payroll): runs from preflight to disbursement with events`.

### Task C3: Payslips (PDF, email, `/me/payroll`)

**Files:** `apps/api/src/modules/payroll/payroll.{pdf,mailer,storage}.ts` with the `payslip.html` template; `packages/mail/**` (new `@erp/mail`; `EmailDispatch` model in `core.prisma` with a migration); copy `my-payslips.tsx`, `payslip-detail.tsx`, `payslips-card.tsx`; `app/(app)/me/payroll/page.tsx`.

**Interfaces:** `sendMail(input: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }): Promise<{ dispatchId: string }>`. With no SMTP configured it records a `SKIPPED` dispatch row and does not throw. Payslip email is triggered by the outbox handler in Task E3, not from a request.

- [ ] **Step 1: Failing tests:** `GET /payroll/payslips/:id` for another employee's payslip is 404 (Review Focus 2); the owner downloads a PDF starting `%PDF`; `sendMail` without SMTP writes one `SKIPPED` row.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement; add `nodemailer` at the original's version without the caret; optional `SMTP_*` in `.env.example`.
- [ ] **Step 4:** Run; expect PASS. Browser check as Employee: own payslip list, detail, PDF.
- [ ] **Step 5:** Commit `feat(payroll): payslips with pdf and mail kit`.

### Task C4: Settlement

**Files:** `packages/contracts/src/settlement/**`; `packages/db/prisma/schema/settlement.prisma`; `apps/api/src/modules/settlement/**` ported (`calc`, `policy`, `service`, `events`); copy `components/settlement` (3 files); page `app/(app)/settlements/page.tsx`.

**Interfaces:**
- Permissions `settlement.read` (department/all), `settlement.create` (department/all), `settlement.approve` (all), `settlement.pay` (all). Events `settlement.approved`, `settlement.paid`.
- Uses `exitChecklist` (B3), approved-claim data (B1) and pending salary (C2) through service functions only.
- Freeze: the employee service exports `setExitFrozen(employeeId: string, frozen: boolean, tx?: Tx)`; settlement calls it on approve and on reject or delete; the employee edit path answers 409 while set.

- [ ] **Step 1: Failing tests** (ported): gratuity per the BD Labour Act using the original's fixtures; notice-pay shortfall; pending salary pro-rated; approving freezes exit fields and editing them is 409; rejecting unfreezes (Review Focus 5); a non-admin approving their own settlement is 403; another employee's settlement by id is 404 (Review Focus 2).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement per the recipe and the freeze interface.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(settlement): final settlement with freeze and events`. Push to both remotes and open the PR for Part C.

---

# Part D - Announcements, events, dashboard, reports (old Plan 6)

### Task D1: Announcements

**Files:** `packages/contracts/src/announcement/**`; `packages/db/prisma/schema/announcement.prisma`; `apps/api/src/modules/announcement/**` ported; copy `components/announcements` (2 files); pages `app/(app)/announcements/page.tsx` (manage) and `app/(app)/me/announcements/page.tsx`.

**Interfaces:** Permission `announcement.manage` (on/off); reading needs none. Publishing writes in-app notices through `@erp/notifications`.

- [ ] **Step 1: Failing tests:** an employee reads and cannot create (403); audience rules (all or department) decide who sees one; publishing writes a notification for each person in the audience.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement and copy the UI.
- [ ] **Step 4:** Run; expect PASS. Browser check.
- [ ] **Step 5:** Commit `feat(announcement): announcements with audience and notices`.

### Task D2: Event feed

**Files:** `packages/contracts/src/event/**`; `packages/db/prisma/schema/event.prisma` (`Event`); `apps/api/src/modules/event/{event.service,event.emit,event.routes,event.types,event.validators}.ts` ported.

**Interfaces:** `readEvents(actor, { limit?, cursor? }): Promise<EventPage>` is the only list function; there is no unfiltered one (HR-MNG-V1 rule). `recordEvent(tx, input)` lets modules write feed entries.

- [ ] **Step 1: Failing tests:** an employee cannot see a leave rejection addressed to someone else; limit is capped at 50; audience rules are resolved at read time.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the port.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(event): audience-filtered event feed`.

### Task D3: Dashboard

**Files:** `packages/contracts/src/dashboard/**`; `apps/api/src/modules/dashboard/**` (ported `dashboard.{service,cards,series,feed,format,greeting,tone,attrition}.ts`); copy the `components/dashboard` section components not already in `@erp/ui/dashboard`; page `app/(app)/dashboard/page.tsx`.

**Interfaces:** `registerDashboardWidget(key: string, provider: WidgetProvider)` exported by the dashboard module and called from `createApp`, as the grant provider is, so dashboard never imports other modules. Each widget declares its permission; `GET /api/dashboard` returns only the permitted widgets.

- [ ] **Step 1: Failing tests:** an Employee sees only personal widgets; a manager sees team widgets; a Finance Officer sees payroll and expense cards; an unregistered or unpermitted widget is absent from the response.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement; copy the original section components unchanged and select them by permission.
- [ ] **Step 4:** Run; expect PASS. Browser check as admin, Employee, manager and Finance Officer.
- [ ] **Step 5:** Commit `feat(dashboard): per-permission widgets from the original sections`.

### Task D4: Reports hub and email log

**Files:** copy `components/dashboard/reports-page.tsx` and `components/notification/email-log-page.tsx`; pages `app/(app)/reports/page.tsx` and `app/(app)/settings/emails/page.tsx`; `GET /api/mail/dispatches` over `EmailDispatch` (permission `settings.manage`).

- [ ] **Step 1: Failing tests:** the reports page lists only the reports the caller's permissions allow; the email log lists dispatch rows newest first and is 403 for an Employee.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Copy, wire, add the dispatch route.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(reports): reports hub and email log`. Push to both remotes and open the PR for Part D.

---

# Part E - Worker, API docs, Docker (old Plan 7)

### Task E1: Worker and outbox delivery

**Files:** `apps/worker/{package.json,tsconfig.json,src/index.ts,src/outbox.ts,src/handlers.ts,src/env.ts}`; `packages/events/src/handlers.ts` (`registerHandler(type, fn)`); a migration adding `deliveredAt`, `attempts`, `lastError`, `nextAttemptAt` to the outbox table if absent, and a `ProcessedEvent(handler, eventId)` unique table.

**Interfaces:** `deliverBatch(limit: number): Promise<{ delivered: number; failed: number }>`; handlers receive `(event, tx)` and are idempotent by `event.id`. Backoff `min(2^attempts minutes, 60)`; after 10 attempts the row stays `FAILED` and is listed by an admin query. My call: a 5 second polling interval.

- [ ] **Step 1: Failing tests:** two deliveries of one event run the handler's effect once (Review Focus 4); a throwing handler increments `attempts` and sets `nextAttemptAt`; a failed event stays in the failure list.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement the poller with `SELECT ... FOR UPDATE SKIP LOCKED`.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(worker): outbox delivery with retry and idempotent handlers`.

### Task E2: Scheduled jobs

**Files:** `apps/worker/src/jobs/{index,attendance-autoclose,attendance-digest,attendance-report-email,payslip-email,asset-sweep,expense-sweep,exit-deactivation}.job.ts` ported from HR-MNG-V1 `src/jobs` (sales jobs excluded), plus the Plan 2 follow-up: deactivate an employee on their last working day.

**Interfaces:** Each job exports `run<Name>(): Promise<number>` (count affected); `startJobs()` schedules them with `node-cron` and `{ timezone: env.APP_TIMEZONE }`, wrapped in a `guard` that logs instead of throwing. Auto-close `5 0 * * *`; digest nudge `30 9 * * *` (the original's times).

- [ ] **Step 1: Failing tests** (ported from HR-MNG-V1 job tests): auto-close closes only finished days; the digest nudges once per day; exit deactivation runs for a last working day of today and not for tomorrow.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Port the jobs onto module service functions (`closeOpenDays` from attendance).
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(worker): scheduled attendance, payslip and sweep jobs`.

### Task E3: Event handlers (notices and email)

**Files:** `apps/worker/src/handlers/{leave,expense,payroll,settlement,asset}.handler.ts`.

**Interfaces:** Handlers turn events into `@erp/notifications` rows and, where HR-MNG-V1 emailed, `sendMail` (payslip on `payroll.run.finalized`, decision emails). Accounting is not a subscriber. Notification email delivery (a Plan 3 follow-up) lands here.

- [ ] **Step 1: Failing tests:** `payroll.run.finalized` queues one payslip email per employee; `expense.claim.approved` notifies the claimant; a replay does neither twice.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Implement and register in `handlers.ts`.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(worker): event handlers for notices and email`.

### Task E4: API docs

**Files:** `apps/api/src/docs/{openapi.ts,index.ts,openapi.test.ts}`; each module contributes its paths in an `openapi.ts` beside its routes.

**Interfaces:** `GET /api/docs` serves the UI and `GET /api/docs.json` the spec. Test: every router in `apiMounts` has at least one documented path.

- [ ] **Step 1:** Failing test for the mount-coverage rule.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Port the original's `apiDocs` structure; document each module's routes, using the contracts' Zod schemas for request and response bodies where possible.
- [ ] **Step 4:** Run; expect PASS.
- [ ] **Step 5:** Commit `feat(api): openapi docs from module contributions`.

### Task E5: Docker and production compose

**Files:** `apps/{api,web,worker}/Dockerfile`, `docker/compose.prod.yaml`, `docker/proxy.conf` (one host serving web at `/` and the API under `/api`, per the deployment assumption), `.dockerignore`, `docs/DEPLOY.md`.

**Interfaces:** Compose runs `postgres`, `migrate` (one-shot `pnpm db:deploy`), `api`, `web`, `worker` and `proxy`. Chromium for `@erp/pdf` is in the `api` and `worker` images only.

- [ ] **Step 1: Failing check:** `docker compose -f docker/compose.prod.yaml config` fails because the file is missing.
- [ ] **Step 2:** Run it; expect FAIL.
- [ ] **Step 3:** Write the multi-stage Dockerfiles (`pnpm deploy` per app) and the compose file.
- [ ] **Step 4:** `docker compose -f docker/compose.prod.yaml up --build -d`; log in through the proxy, punch in, and see the outbox drain; expect every service healthy.
- [ ] **Step 5:** Commit `feat(docker): images and production compose for api, web and worker`.

### Task E6: Close-out

**Files:** the ledger (all stages done), `CLAUDE.md` (worker present, `@erp/pdf` and `@erp/mail` listed as shared kits, new commands), spec section 12, the follow-ups files.

- [ ] **Step 1: Failing check:** `rg "planned and not yet present" CLAUDE.md` finds the worker note.
- [ ] **Step 2:** Run; expect a hit (FAIL).
- [ ] **Step 3:** Update the docs, then walk every in-scope HR-MNG-V1 route against its ERP page and list any left unmatched in the PR body.
- [ ] **Step 4:** `pnpm typecheck && pnpm lint && pnpm build && pnpm test`; expect PASS.
- [ ] **Step 5:** Commit `docs: close the exact-port ledger and update agent notes`. Push to both remotes and open the PR for Part E.
