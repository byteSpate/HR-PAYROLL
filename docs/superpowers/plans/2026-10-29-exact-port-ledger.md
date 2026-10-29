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

Part B completed on the same branch:

- B3/B4 Assets: categories, register, custody (append-only, one open holder per asset by a partial unique index), requests (approve, reject, withdraw, order, fulfil, timeline), repairs, recoveries (waive, never delete), exit checklist and `sweepRecoveriesCollected` for settlement, files, import and export, and the screens at `/assets` (register), `/assets/ledger`, `/me/assets` and Settings, Asset categories. Request approval is the `asset.approve` grant instead of Super Admin alone.
- B5 Costs: categories, commitments, bills, pay, summary, receipts, import, export, and the screens at `/costs` (sidebar "Expenses") with Settings, Cost categories. Events `cost.bill.accrued` and `cost.bill.paid`.
- B6 Depreciation and value: runs (draft, post, reverse, delete), preflight, and the asset value report at `/assets/depreciation` and `/assets/value`. Events `depreciation.run.finalized` and `depreciation.run.reversed`.

Deviations to remember: the ledger writes (capitalise, pay, dispose, depreciation posting, cost accrual and payment) are events with the figures a bookkeeper needs, since accounting is out of scope. A new permission `asset.capitalise` (capitalise, pay, dispose, depreciation) and `asset.value` were added beside the planned four; cost permissions are on/off because a company cost has no owner to scope by. Depreciation rate is a column on the asset category (yearly percent of the book value at the start of the financial year, July start), because there is no chart of accounts to hold it; the original takes it from the account. A reversed run frees its month (partial unique index) and only the latest posted run can be reversed. Book value counts posted runs only. Cost and the frozen BDT figures are left out of an asset read for anyone who cannot see costs, where the original left the BDT figures in. Capitalised cost and currency cannot be edited. Foreign-currency operating costs are refused, as in the original. The "recover from payroll" action and its payroll-settings switch wait for payroll (Part C); the screen has no button for it until then. Asset category settings gained the kind (IT or not), the registered-one-by-one switch and the depreciation rate, which the original's form lacked while its API required them. The depreciation and cost tables share the new `IdCounter` series table with asset tags.

## Progress (Plan 5, Part C, branch `feat/payroll-settlement`)

Plan: `2026-10-29-erp-plan-5-part-c-payroll-settlement-mail.md`.

- C1 Mail: `@erp/mail` (`sendMail` never throws and records every message in `EmailDispatch`; no SMTP records a skipped row), the brand email template, and the optional `SMTP_*` variables.
- C2 Account mail: change email by two links (approve at the old address, confirm at the new), an administrator's resend of credentials, and the administrator's direct change of someone's address (`PATCH /employees/:id/email`: applied at once, audited with both addresses, both addresses told, sessions revoked, an unused invite reissued). Screens: the public approve and confirm pages, the change-email dialog and pending notice, Resend password on Users and on the employee page.
- C3/C4 Payroll configuration and pay: salary structures (authored with `payroll.config`, assigned with `employee.update`), payroll settings (Settings, Payroll settings), the pay calculation (ported unchanged), preflight, adjustments, and the asset recovery path "Recover from payroll".
- C5/C6 Runs and payslips: draft, process, submit, approve, reject, disburse, delete; the bank file (audited); payslip PDF on request; "Email payslips" for a run; `/me/payroll`. Events `payroll.run.submitted`, `payroll.run.rejected`, `payroll.run.finalized` (the figures the books need), `payroll.run.disbursed`, `payslip.published`. Approved claims are paid (REIMBURSED, with the payslip) when the run is disbursed, as in the original, so the expense report's `paidOn` is the payslip number.
- C7 Settlement: calculate, override, approve, reject, pay, the statement mailed on pay, and the events `settlement.approved` and `settlement.paid`.
- C8 Admin employees: the original's employee list with add, and the detail page with edit cards, salary structure, shift, exit details, leave balance, held assets, payslips and the administrator's change of sign-in email.

Deviations to remember:

- Permissions are `payroll.read|manage` (department or all), `payroll.approve|disburse` (all), `payroll.config`, and `settlement.read|create` (department or all) and `settlement.approve|pay` (all). Run, approval and disbursement routes ask for the grant at `all`. The original's Finance, HR and Super Admin roles are not ported.
- Separation of duties: whoever processed or submitted a run, or calculated a settlement, cannot approve or return it unless they hold an administrator level.
- One live run per month is a partial unique index on `(year, month)` where the run is not deleted, in place of the original's `activeKey` column. Process takes the run's row lock, so two people processing the same run take turns.
- Exit details are frozen while the employee has an approved or paid settlement; this is derived from the settlement, not stored. Rejecting a settlement keeps it a draft, as in the original, so it does not change that.
- `assertMonthNotLocked` is shared (`apps/api/src/lib/month-lock.ts`) and wired into holiday writes, payroll adjustments and exit details; an approved or disbursed month refuses them.
- Payslip PDFs are rendered on request and not cached (the original cached them in its file store). A payslip email with no SMTP is recorded as not sent, never as sent.
- Decision and reminder emails (expense, asset request, leave, national ID, payroll submitted) are not sent yet; in-app notices stand in until the worker (Part E). Payroll submitted notifies the approvers in the app.
- The admin employee screens live in a new `people` module (no permissions or navigation of its own), because they combine payroll, leave, assets and settlement, which all depend on `employee`. The original's Add employee page is a dialog on the list, so the `/employees/new` route and its nav entry are gone. The add form has no Role field (a permission role is set on Users), reporting managers are any active employee, and the Techno Sales Hub switch, the device enrolment row and the profile insights (Part D) are not on the detail page.
- Wire money from payroll and settlement is the database decimal as a string without trailing zeros (as the original), not fixed to two places.

## Plan 3 code that deviates and will be replaced

`apps/web/modules/attendance`, `apps/web/modules/leave`, the `@erp/ui/page` kit (signatures differ from the original `StatCard`, `PageHeader`), the employee and department pages from Plan 2, and the nav manifests for attendance and leave.
