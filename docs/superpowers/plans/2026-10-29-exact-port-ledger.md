# Exact port of HR-MNG-V1 into the monorepo: ledger

## Rule (from the owner)

ERP must look and behave exactly like HR-MNG-V1. **Copy its files; do not write new ones.** The only deliberate difference is the sidebar: an item whose page stacks several sections becomes a collapsible group with one child page per section, and each child renders the original section component unchanged. Scope is everything except accounting and the Sales Hub.

Allowed edits to a copied file: import paths, and the data layer underneath it (see "Data layer"). Nothing else: no renamed props, no restyled markup, no new components.

## Out of scope

`components/accounting`, `components/sales`, `components/statements`, `components/posting`, and the routes for accounting, statements, posting rules, customers, suppliers, deals and journals.

## What is in scope (HR-MNG-V1 `client/components`, lines)

attendance 3051, leave 1521, employees 1054, directory 471, profile 3736, settings 2417, announcements 754, notification 223, payroll 2525, expense 1598, settlement 662, cost 2356, asset 5298, depreciation 480, money 3989, import-export 553, dashboard kit 3684, ui 3366, plus `lib/api` (4706 for the attendance page's closure alone).

The attendance page alone pulls in 48 files and about 12,000 lines (lib/api 4706, attendance 3051, ui 1573, dashboard 1505, import-export 553). Foundations come first.

## Role areas and their sidebars (from each `components/<area>/nav-config.ts`)

- **admin:** Overview (Dashboard, Employees, Attendance, Leave, Assets) / Payroll & finance (Payroll, Salary structures, Employee expenses, Settlements, Expenses) / Administration (Users, Reports, Activity, Announcements, Emails, Settings, My Profile)
- **hr:** People (Dashboard, Employees, Attendance, Leave, Assets) / Payroll (read) (Payroll, Employee expenses, Settlements, Expenses) / Communication (Reports, Activity, Announcements, Settings, My Profile)
- **employee:** Workspace (Dashboard, Attendance, Leave, Payroll, Expenses, Assets, Directory) / Account (Announcements, My Profile)
- **finance:** Finance (Dashboard, Payroll, Salary structures, Employee expenses, Settlements, Expenses, Assets, Depreciation, Asset value, Announcements) / Reference (read) (Employees, Attendance, Leave, Reports, Activity) / Account (Settings, My Profile)
- **manager:** not yet read; `components/manager` is 2 files.

Employee and admin sides are separate pages, as in the original (`/employee/attendance` is the punch card and own month; `/admin/attendance` is the org view).

**Two points of view only (owner, 2026-10-29).** HR-MNG-V1 had fixed roles, so each role (HR, finance, manager, employee) saw its own pages. Here there is the **employee** (`/me/...`) and one **admin** (module routes) who sees every route those roles had, combined. The `hr`, `finance` and `manager` variants are not ported (for example `manager/team`). Permissions are not curated yet: the roles and permissions already built stay as they are, and the admin hands them out later.

## Collapsible mapping

The original `/admin/attendance` page stacks: my attendance, Attendance approvals, Today (live board), Monthly summary with corrections, Holiday calendar, Reports. Admin sidebar group **Attendance** becomes: Attendance Approvals, Today's Attendance, Reports, Holiday Calendar (children copied from `approvals-section`, `DailyBoard`, `AttendanceReports`, `HolidaySection`). Leave and the other stacked pages follow the same rule once their sections are read.

## Data layer

The original screens call HR-MNG-V1's own API through `lib/api/*` with its response shapes and role-based session. ERP's API is permission-based and its routes differ. Decision: keep ERP's modular API and tests, and put one adapter under the copied screens (`lib/api/*` in the web app mapping ERP endpoints to the original shapes). Modules ERP has no backend for yet (assets, payroll, expenses, settlements, costs, salary structures, emails) get their server port from the existing plans first; their screens are copied then, not before.

## Stages

0. Foundations: exact `components/ui` and `components/dashboard` kit, `lib/utils`, session adapter, API adapter. Replaces the page kit written in Plan 3.
1. Shell: exact sidebar, header and brand, with the collapsible grouping.
2. Attendance, admin and employee sides.
3. Leave, admin and employee sides.
4. Dashboard, employees, directory, profile.
5. Settings, users, reports, activity, announcements, notification bell.
6. Modules with no ERP backend yet.

Stages 2 to 5 for the already-built modules and stage 6 are scheduled in `2026-10-29-erp-plan-4-remaining-work.md` (Part A, then Parts B and C).

## Progress (Plan 4, Part A, branch `feat/exact-port-people`)

Done, tested (unit, API over HTTP, browser) and pushed:

- A1 `@erp/pdf` (the original's own renderer and limiter) and the attendance PDF report (was 501).
- A2 Employee attendance `/me/attendance`: the original's page, punch card and calendar, with `/attendance/today`, a derived `/attendance/me`, `/attendance/summary/me` and `PATCH /attendance/me/:id/regularise`. A punch returns the original's `PunchResult` and judges a half-day leave against the half actually worked.
- A3 and A4 Leave: the original's `LeavePage` as three section pages (`mine`, `requests`, `team`), the original's apply dialog and detail sheet, and the original's wire shapes (`days`, `decidedBy`, balances with `entitlement` and `pending`, team status, half-day window). Leave Types stays a fresh page until Settings (A6).
- A5, API half: the employee API now returns the original's `EmployeeView` (`work`, `personal` with `nationalIdChangeRequest`, `contact`, `employment` with `employeeCode`, `shift`, `accountActive`, `passwordPending`, `payroll`, `exit`, `documents`, `blockers`). The old employee screens were patched to read it.
- A5, employee point of view: `/me` (the original's `MyProfilePage`, or `AccountProfile` for an account with no employee record, whose permissions panel lists the real grants) and `/me/directory`, with `profile-api.ts`, account and session endpoints, own avatar, display name that can be cleared, and `expiresAt` on document links. Moved on: admin employees list, detail and add, with salary structure, to Part C; insights and the activity feed to Part D; self change-email to C3.

- A6 Settings: one sidebar item whose children are pages, each rendering the original's panel inside the original's tab strip (the strip is built from the same nav entries, so page and sidebar cannot disagree). Done: Departments (no cost nature, accounting is out of scope), Shifts (with the weekly-off impact notice and the undeletable General default, now a seeded row), Leave types (the original's statutory floor, partial update). Users is the original's page with ERP's data model: an account's level plus an administrator-made role instead of five fixed roles, and only the super admin may appoint an admin. Roles & Permissions stays ERP's own page, since roles are made by administrators here.
- A7 cleanup: removed the fresh department, shifts, leave types, users, manual-entry and My Team pages and the helpers behind them.

Moved to later parts, not dropped:

- Activity (the original's events feed) with the events module in Part D. Resend-password with `@erp/mail` in C3. Asset categories (B), cost categories (B), exchange rates and payroll settings (C): each adds its own Settings child.
- The `@erp/ui/page` kit stays until the last fresh screens that use it are replaced: admin employees list, detail and add (C), dashboard (D), Roles and Activity pages.

## Progress (Plan 4, Part B, branch `feat/expense-asset-cost`)

Done, tested (unit, API over HTTP, browser) and pushed:

- B0 (added): the `exchange` module (rates, resolution that never defaults to 1, Settings panel) and the money helpers (`@erp/db`, `@erp/ui/lib/money`). Expense reads rates through it, and payroll will too; payroll reads expense claims, so the rates could not live in payroll.
- B1 Expense backend: claims, categories (seeded with the seven standard ones), scoped reads (an out-of-scope claim is a 404), amend and withdraw own pending claims, approve, reject and batch approve at the spend-date rate (frozen, `expense.claim.approved` carries the BDT amount), receipts through `@erp/attachments`, reports (JSON, CSV, PDF) and outstanding reimbursements. REIMBURSED is set only by `reimburseClaims`, which payroll and settlement call inside their own transaction. `scopeForViewer` and `storageReady` moved into the shared places (employee module, `@erp/attachments`).
- B2 Expense UI: the original `ExpensePage` at `/expenses` (everybody's) and `/me/expenses` (a person's own), chosen by a `view` prop; permissions decide the approve controls.

Deviations to remember: `paidOn` in the report and the `payslip` join on a claim stay empty until payroll exists (Part C adds them); HR-MNG-V1's legacy `receiptUrl` and `legacyCategoryText` columns are not carried; decision emails wait for `@erp/mail` (C3), and the claimant gets an in-app notice meanwhile.

Review fixes on B0 to B2, decided here so later modules follow them:

- Anything that changes a record or decides on it takes the record's row lock and re-reads it inside its own transaction (`expense.lock.ts`). A status read before the transaction proves nothing, so a loser of a race with an approval gets a 409, and a decision uses the figures as they stand once it holds the lock. Files are removed from storage only after the database change has committed. Assets, costs and payroll use the same pattern.
- Reading a record includes the permission to decide on it: `scopeForViewer` takes several permissions and returns the union, and expense lists and opens claims for `expense.read` or `expense.approve`. An approver needs no separate read grant.
- Money and rates travel and validate as decimal strings (`positiveDecimal` in `@erp/contracts`, checked against the column's precision), never as floats. A JSON number is accepted through its shortest decimal form.

Still open in Part B: B3 and B4 assets, B5 costs, B6 depreciation.

## Plan 3 code that deviates and will be replaced

`apps/web/modules/attendance`, `apps/web/modules/leave`, the `@erp/ui/page` kit (signatures differ from the original `StatCard`, `PageHeader`), the employee and department pages from Plan 2, and the nav manifests for attendance and leave.
