# ERP Monorepo — Design

**Date:** 2026-10-27
**Status:** Draft, awaiting approval
**Source app:** `byteSpate/HR-MNG-V1` (read-only reference; never modified)

## 1. Intent

`HR-MNG-V1` is an HR & Payroll system built as two separate npm projects
(`server/`, `client/`) with ~25 backend modules, including a TechnoSales Hub
and an accounting suite that is tangled into HR flows.

We are building `ERP`: a Turborepo monorepo on the same stack, where every
business area is its own module folder, so the product can be sold and grown
module by module like an ERP. Accounting will be rebuilt from scratch later as
a clean module; this design must make that easy without building it now.

**Success looks like:** the kept HR modules work as they do today, the code is
cleaner than the original, a new module (accounting next) can be added by
creating folders in the agreed places without editing other modules, and a
feature used by several modules (approvals, attachments, exports…) exists once.

## 2. Goals, non-goals, anti-goals

**Goals**
- Port the kept modules from `HR-MNG-V1` (business logic + tests), cleaned up.
- One folder per module on each side (api, web), shared code in `packages/`.
- Maximum reuse: a capability needed by 2+ modules lives in a shared package.
- Permission-based access that each module extends on its own.
- Module-based navigation: collapsible sidebar group per module, sub-pages as real routes.
- Event-based integration points (outbox) so future accounting can subscribe.

**Non-goals (now)**
- TechnoSales Hub: `sales`, `dealMoney`, `customer`, the `(sales)` route group, sales cron jobs.
- Accounting: `accounting`, `posting`, `statements`, `receivables`, `supplier`,
  `supplierBill`, `vatCode`, `cost`, `depreciation`, and
  client `lib/` helpers for bills, invoices, quotes, VAT, payments, costing.
- Per-client module enable/disable. Not part of the app (user decision).
- Multi-tenancy.
- Migrating live data from the `HR-MNG-V1` database.

**Anti-goals (failure even if it "works")**
- Modules importing each other without a declared dependency, or circular module dependencies.
- The same feature implemented twice in two modules.
- Mock data, dead sales/accounting code, or commented-out leftovers carried over.
- Long multi-purpose files; the original's messiness copied across.
- Duplicated pages per role (today's `/admin/leave`, `/hr/leave`, `/manager/leave`…).

## 3. Constraints

- **Stack (same libraries and versions as `HR-MNG-V1`):** Node 24, TypeScript,
  Express 5, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, Zod 4, bcrypt, JWT
  (jsonwebtoken) + cookie sessions, multer, Cloudinary, nodemailer, exceljs,
  puppeteer, node-cron, swagger-ui-express, helmet/cors/compression/morgan;
  Next.js 16 (App Router), React 19, TanStack Query 5, Tailwind 4, shadcn-style
  components; vitest.
- **Tooling:** pnpm workspaces + Turborepo, following the conventions in
  `byteSpate/HMS` (exact versions, `savePrefix: ''`, `allowBuilds` allowlist,
  shared `config-typescript` / `config-eslint` packages).
- **Env:** user will supply a new env later. Commit only `.env.example` files.
- **Prisma migrations:** `prisma migrate dev` is interactive and fails in
  agent shells; use the `migrate diff` → `migrate deploy` recipe documented in
  `HR-MNG-V1/CLAUDE.md`.
- **Visuals:** colours, fonts, and component look from `HR-MNG-V1/DESIGN.md`
  and the current client. Only the *sidebar structure* comes from the
  reference screenshot (§8).

## 4. Repository layout (decided: split by layer)

```
ERP/
├─ apps/
│  ├─ api/                         Express app
│  │  └─ src/
│  │     ├─ app.ts                 builds the app, mounts each module router
│  │     ├─ index.ts               starts the server
│  │     ├─ middleware/            auth, permission guard, error handler, request log
│  │     └─ modules/
│  │        ├─ auth/  users/  employee/  department/
│  │        ├─ attendance/  leave/  payroll/  expense/  asset/  settlement/
│  │        └─ announcement/  event/  notification/  dashboard/
│  ├─ web/                         Next.js app
│  │  ├─ app/
│  │  │  ├─ (auth)/                login, forgot/reset password
│  │  │  └─ (app)/                 shell layout with sidebar + topbar
│  │  │     ├─ me/  employees/  departments/  attendance/  leave/
│  │  │     ├─ payroll/  expenses/  assets/  exits/  announcements/
│  │  │     └─ settings/  dashboard/
│  │  └─ modules/
│  │     └─ <module>/              components, hooks, api client for that module
│  └─ worker/                      cron jobs + outbox delivery
│     └─ src/{jobs,outbox}/
├─ packages/
│  ├─ config-typescript/  config-eslint/
│  ├─ db/                          Prisma client, multi-file schema, migrations, seed
│  ├─ contracts/                   per-module Zod schemas, types, permissions, nav
│  │  └─ src/<module>/{schemas.ts, permissions.ts, nav.ts, events.ts}
│  ├─ auth/                        JWT/session helpers, permission checks (server + client)
│  ├─ events/                      outbox write API + typed event registry
│  ├─ ui/                          design tokens, shadcn components, DataTable, Sidebar, forms
│  ├─ approvals/                   generic approve/reject/bulk workflow (server + UI)
│  ├─ attachments/                 upload, signed URLs, Cloudinary (server + UI)
│  ├─ notifications/               in-app + email (templates, nodemailer)
│  ├─ audit/                       audit log writes + timeline UI
│  ├─ export/                      Excel import/export (exceljs), PDF (puppeteer)
│  └─ utils/                       dates, money, pagination, errors
├─ docker/  docker-compose.yml
├─ turbo.json  pnpm-workspace.yaml  package.json
└─ docs/
```

Package scope: `@erp/*` (my call).

### 4.1 Module folder shape

API module (`apps/api/src/modules/leave/`), one job per file:
`leave.routes.ts`, `leave.controller.ts`, `leave.service.ts`, `leave.policy.ts`
(business rules), plus focused helpers (`leave.accrual.ts`, `leave.dates.ts`)
and co-located `*.test.ts`. Validation schemas come from `@erp/contracts/leave`,
not local files.

Web module (`apps/web/modules/leave/`): `components/`, `hooks/` (TanStack Query
hooks), `api.ts` (typed client using contracts). Pages under
`apps/web/app/(app)/leave/**` stay thin and compose module components.

### 4.2 Reuse and boundary rules

1. Modules that genuinely depend on other modules may use them directly (user
   decision). Payroll, for example, reads employee, attendance, leave, expense and
   asset data and, on disburse, marks expense claims reimbursed and asset
   recoveries collected **in the same transaction**. That must stay atomic.
2. Each module declares the modules it depends on (my call: a `deps` list in
   `@erp/contracts/<module>/module.ts`). Importing an undeclared module is a lint
   error, and the dependency graph must stay acyclic.
3. Reads of a dependency's tables via the shared Prisma client are fine. Writes to
   a dependency's data go through that module's service functions, not raw
   queries on its tables, so its business rules still apply. Service functions
   accept an optional Prisma transaction client so callers can stay atomic.
4. Loose couplings (things that should react *later* or might not be installed,
   e.g. accounting, notifications) go through events, not imports.
5. When two modules need the same capability, extract it to a shared package
   rather than copy it.
6. Draft dependency graph (builder verifies against the source):
   - employee → department
   - attendance, leave, expense, asset → employee
   - payroll → employee, attendance, leave, expense, asset
   - settlement → employee, payroll, expense, asset
   - dashboard → any module (read-only)
7. Enforced with an ESLint boundary rule (e.g. `eslint-plugin-boundaries`) in
   `config-eslint`. **Builder's choice of mechanism.**
8. `apps/web` must never import server-only packages' server entry points;
   shared packages that have both sides expose `/server` and `/client` (or `/ui`)
   subpath exports, with `server-only` on the server entry.

## 5. Modules

| Module | Kept from HR-MNG-V1 | Notes |
|---|---|---|
| core: auth, users | `auth` | login, staff-login, refresh, sessions, password/email flows, user admin |
| employee | `employee` | profile, documents, national-ID requests, insights, export |
| department | `department` | CRUD + Excel import/export |
| attendance | `attendance` + jobs | check-in/out, regularise, approvals, shifts, holidays, reports, auto-close/digest/report-email jobs |
| leave | `leave` | types, balances, requests, accrual, team status, half-day window |
| payroll | `payroll` + payslip-email job | exchange rates, settings, salary structures, runs (preflight→process→submit→approve→disburse), bank file, payslips PDF/email, adjustments. **Posting removed → events** |
| expense | `expense` | claims, categories, receipts, approvals, report. **Posting removed → events** |
| asset | `asset` | assets, categories, requests, assign/return/retire/lost, repairs, recoveries. Capitalise/pay/dispose are accounting-coupled → see §11 |
| settlement (Exit & Settlement) | `settlement` | final settlement on exit: gratuity (BD Labour Act), notice pay, pending salary, expense reimbursement, asset recoveries; employee exit details freeze once a settlement is approved. **Ledger posting removed → events** |
| announcement | `announcement` | CRUD |
| event | `event` | calendar feed |
| notification | `notification` | becomes `@erp/notifications` package + thin api module |
| media | `media` | becomes `@erp/attachments` |
| dashboard | `dashboard` | per-permission widgets (replaces today's per-role dashboards) |

`reporting` is empty in `HR-MNG-V1` and is **not** carried over (my call).
Reports live in their owning module (Attendance → Reports, Expenses → Expense Report).

## 6. Access control: permissions

- Each module declares permissions in `@erp/contracts/<module>/permissions.ts`,
  e.g. `leave.request.create`, `leave.request.approve`, `payroll.run.process`.
- **Access levels** (user decision, revised 2026-10-27, replaces the earlier
  SUPER_ADMIN role and multi-role design):
  - `SUPER_ADMIN`: exactly one user, fixed (DB-enforced). Created by the seed,
    holds every permission implicitly, cannot be deactivated, edited or demoted
    through the app. Only the super admin appoints or removes admins. Ownership
    changes only through a server-side CLI command.
  - `ADMIN`: any number. Hold every permission implicitly, including those of
    modules added later. Cannot act on the super admin or other admins, and
    cannot appoint admins.
  - `STANDARD`: everyone else; exactly **one role** each (user decision).
- **Roles** are editable bundles of grants; starter roles HR Admin, Finance
  Officer and Employee are seeded and fully editable. Permissions are synced
  from code on deploy/seed. A grantor can only hand out grants (permission and
  scope) they hold themselves.
- **Scopes** (my call, user delegated): a permission declares which scopes it
  supports from `own < team < department < all`, or none (plain on/off).
  A wider grant covers narrower ones. Grants are stored as permission + scope.
  - `own` is implicit for every user with an employee record.
  - `team` (direct reports) is implicit for anyone with active direct reports,
    for permissions the manifest marks as manager defaults (user decision:
    manager powers are derived, not assigned).
  - `department` and `all` come only from the user's role.
- One check answers both "may this user do X" and "on which records":
  `can(user, key)` and `scopeFor(user, key)`, used by the API middleware, the
  service layer's record filters, the web `<Can>` and nav filtering.
- Per-client module enable/disable is not part of the app (user decision).
- The old Sales Hub access flag is dropped.

## 7. Events (transactional outbox)

- `@erp/events` exposes `emit(tx, event)` writing to an `outbox_event` table
  inside the caller's Prisma transaction.
- Event types are declared per module in `@erp/contracts/<module>/events.ts`
  with Zod payload schemas.
- `apps/worker` polls the outbox, dispatches to registered handlers, marks
  delivered, retries with backoff, and keeps failures visible.
- Initial events: `payroll.run.finalized`, `payroll.run.disbursed`,
  `expense.claim.approved`, `expense.claim.reimbursed`, `settlement.approved`,
  `settlement.paid`, plus asset events (§11).
  No subscribers yet besides notifications where useful; accounting subscribes later.
- Event handlers must be idempotent (event id dedupe).

## 8. Frontend navigation

- Routes are per module, not per role. Employee self-service lives under `/me`.
- Sidebar: one collapsible group per module (icon + label), sub-items listed
  under a vertical guide line, active group expanded, each sub-item with its own
  line icon. **Structure from the reference screenshot; colours and fonts from
  `HR-MNG-V1`.**
- Every sub-item is a real route. "Add X" / "New X" items are full pages.
- Each module defines its group in `@erp/contracts/<module>/nav.ts`:
  `{ label, icon, items: [{ label, href, icon, permission }] }`. The shared
  `Sidebar` in `@erp/ui` renders all groups and hides items the user lacks the
  permission for, and hides a group with no visible items.

### 8.1 Draft menu (user to edit)

Derived from the existing pages and endpoints in `HR-MNG-V1`.

| Group | Sub-page | Route | Permission |
|---|---|---|---|
| **Dashboard** | Overview | `/dashboard` | (any signed-in) |
| **My Space** | My Profile | `/me` | (any) |
| | My Attendance | `/me/attendance` | (any) |
| | My Leave | `/me/leave` | (any) |
| | My Payslips | `/me/payslips` | (any) |
| | My Expenses | `/me/expenses` | (any) |
| | My Assets | `/me/assets` | (any) |
| | Directory | `/me/directory` | (any) |
| **Employees** | Add Employee | `/employees/new` | `employee.create` |
| | Employee List | `/employees` | `employee.read` |
| | My Team | `/employees/team` | (has direct reports) |
| | ID Change Requests | `/employees/id-requests` | `employee.update` |
| **Departments** | Department List | `/departments` | `department.read` |
| | Import Departments | `/departments/import` | `department.import` |
| **Attendance** | Today | `/attendance` | `attendance.read.team` |
| | Approvals | `/attendance/approvals` | `attendance.approve` |
| | Manual Entry | `/attendance/manual` | `attendance.manage` |
| | Reports | `/attendance/reports` | `attendance.report` |
| | Shifts | `/attendance/shifts` | `attendance.config` |
| | Holidays | `/attendance/holidays` | `attendance.config` |
| **Leave** | Apply Leave | `/leave/apply` | `leave.request.create` |
| | Leave Requests | `/leave/requests` | `leave.request.read.team` |
| | Approvals | `/leave/approvals` | `leave.request.approve` |
| | Team Status | `/leave/team` | `leave.request.read.team` |
| | Leave Types | `/leave/types` | `leave.config` |
| **Payroll** | Run Payroll | `/payroll/runs/new` | `payroll.run.create` |
| | Payroll Runs | `/payroll/runs` | `payroll.run.read` |
| | Payslips | `/payroll/payslips` | `payroll.payslip.read` |
| | Adjustments | `/payroll/adjustments` | `payroll.adjustment.manage` |
| | Salary Structures | `/payroll/structures` | `payroll.config` |
| | Exchange Rates | `/payroll/exchange-rates` | `payroll.config` |
| | Payroll Settings | `/payroll/settings` | `payroll.config` |
| **Expenses** | New Claim | `/expenses/new` | `expense.create` |
| | Claims | `/expenses` | `expense.read.team` |
| | Approvals | `/expenses/approvals` | `expense.approve` |
| | Categories | `/expenses/categories` | `expense.config` |
| | Expense Report | `/expenses/report` | `expense.report` |
| **Assets** | Add Asset | `/assets/new` | `asset.create` |
| | Asset List | `/assets` | `asset.read` |
| | Requests | `/assets/requests` | `asset.request.approve` |
| | Repairs | `/assets/repairs` | `asset.manage` |
| | Recoveries | `/assets/recoveries` | `asset.manage` |
| | Categories | `/assets/categories` | `asset.config` |
| **Exits** | New Settlement | `/exits/new` | `settlement.create` |
| | Settlements | `/exits` | `settlement.read` |
| | Approvals | `/exits/approvals` | `settlement.approve` |
| **Announcements** | New Announcement | `/announcements/new` | `announcement.create` |
| | All Announcements | `/announcements` | (any) |
| **Settings** | Users | `/settings/users` | `user.manage` |
| | Activity Log | `/settings/activity` | `audit.read` |
| | Roles & Permissions | `/settings/roles` | `role.manage` |
| | Email Settings | `/settings/emails` | `settings.manage` |
| | General | `/settings` | `settings.manage` |

Permission names are illustrative; the builder finalises them per module.

## 9. Data

- One PostgreSQL database. Prisma multi-file schema in `packages/db/prisma/schema/`:
  `core.prisma` (users, roles, permissions, sessions, audit, outbox, attachments,
  notifications), then one file per module (`employee.prisma`, `leave.prisma`…).
- Fresh migration history (no live data migration). Port models from
  `HR-MNG-V1/server/prisma/schema.prisma` (107 models today), dropping every
  sales/accounting model and every relation/column that exists only for them
  (e.g. ledger account links, posting references, Sales Hub access flag).
- Seed + reference data (`seed.ts`, `sync-reference.ts`, BD Labour Act leave
  defaults) carried over, minus sales/accounting.

## 10. Carry-overs

- **Tests:** vitest tests move with their module and must pass; posting tests are dropped.
- **API docs:** Swagger at the same kind of path; each module contributes its paths.
- **Jobs (in `apps/worker`):** attendance auto-close, attendance digest,
  attendance report email, payslip email. Sales jobs dropped.
- **Docker:** `docker-compose.yml` with postgres + api + web + worker; Dockerfile per app.
- **Templates:** email/PDF templates move with their owning package/module.
- **Cleanliness:** short single-purpose files; no mock data, no dead code, no
  sales/accounting remnants; keep comment density similar to the clean parts of the original.

## 11. Decisions left to the builder (marked as my calls)

- Exact boundary-lint mechanism (§4.2).
- Final permission strings (§8.1 is a draft).
- Outbox polling interval and retry policy.
- **Asset accounting actions** (`capitalise`, `pay`, `dispose`, `recoveries` that
  hit the ledger): my call is to keep the operational state changes and replace
  ledger writes with events (`asset.capitalised`, `asset.disposed`…), same as payroll/expense.
- Any HR module function found to depend on accounting data beyond posting:
  replace with an event or drop the field, and list each case in the PR.

## 12. Order of work (for the plan)

1. Monorepo skeleton (pnpm, turbo, config packages, empty apps building).
2. `db`, `utils`, `contracts`, `auth` (permissions), `events`, `ui` (tokens, shell, Sidebar).
3. Core: auth/users/roles end to end (api + web), login working.
4. Shared kits as first needed: attachments, approvals, notifications, audit, export.
5. Modules in dependency order: employee, department, attendance, leave,
   expense, asset, payroll, settlement, announcement, event, dashboard.
6. Worker: jobs + outbox. Docker. Swagger.
