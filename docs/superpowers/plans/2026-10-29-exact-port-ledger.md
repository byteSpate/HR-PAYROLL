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

## Plan 3 code that deviates and will be replaced

`apps/web/modules/attendance`, `apps/web/modules/leave`, the `@erp/ui/page` kit (signatures differ from the original `StatCard`, `PageHeader`), the employee and department pages from Plan 2, and the nav manifests for attendance and leave.
