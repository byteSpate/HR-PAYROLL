# ERP Plan 2 - Employee and Department Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HR can create employees (with their login), organise them into departments, manage their records and documents, and every employee can see and edit their own profile and browse a staff directory; managers get team access worked out from their direct reports.

**Architecture:** Two new modules, `department` and `employee` (`employee` depends on `department`), built the Plan 1 way: manifest in `@erp/contracts`, schema file in `@erp/db`, folder in `apps/api/src/modules` and `apps/web/modules`. Three shared kits are extracted because these modules are their first users and later modules reuse them: `@erp/audit`, `@erp/export` (Excel/CSV export and import), `@erp/attachments` (file storage with Cloudinary). Core gains a permission-provider hook so `employee` can add team permissions to people with direct reports without core importing `employee`.

**Tech Stack:** as Plan 1. New dependencies, same versions as `HR-MNG-V1/server`: `exceljs`, `multer` + `@types/multer`, `cloudinary`.

**Spec:** `docs/superpowers/specs/2026-10-27-erp-monorepo-design.md`
**Follow-ups carried in:** `docs/superpowers/plans/2026-10-27-erp-plan-1-followups.md`

## Global Constraints

Everything in Plan 1's Global Constraints, plus:

- Git: work on branch `feat/employee-department` (from `dev`); Conventional Commits, plain ASCII, no AI attribution (`docs/GIT_WORKFLOW.md`). Push to both remotes; PR into `dev`.
- Port behaviour from `HR-MNG-V1/server/src/modules/{employee,department,media}` and `src/utils/{export,import}`, dropping sales, accounting, salary structure, shift, device ID, insights and email invites. Those belong to later plans and must not appear as columns or code now.
- Visibility tiers (ported from `employee.access.ts`, now permission-based), resolved in this order, first match wins:
  1. `SELF`: the viewer's own record.
  2. `FULL`: viewer holds `employee.read.all`.
  3. `FINANCE`: viewer holds `employee.read.financial`.
  4. `MANAGER`: the subject's `reportingManagerId` is the viewer's employee id.
  5. `COLLEAGUE`: everyone else.
- Field visibility:
  - Work identity (name, designation, department, manager, email, phone, avatar): every tier.
  - Employment (type, status, joining date, office location): every tier except `COLLEAGUE`.
  - Personal (DOB, gender, national ID, blood group, marital status, addresses, emergency contact): `SELF` and `FULL`.
  - Money (bank fields): `SELF`, `FULL` and `FINANCE`.
- Writable fields: `SELF` gets `SELF_EDITABLE_FIELDS` as in HR-MNG-V1 (phone, presentAddress, permanentAddress, dateOfBirth, gender, emergencyContact, maritalStatus, bloodGroup). `employee.update` holders get those plus fullName, designation, departmentId, reportingManagerId, employmentType, joiningDate, officeLocation, bankAccountNumber, bankName, bankRoutingNumber. National ID changes only through change requests. Nobody can edit their own bank fields.
- Team permissions are derived, never assigned: a user whose employee record has at least one active direct report gets `TEAM_PERMISSIONS` added to their token at login/refresh.
- Cloudinary is optional. When `CLOUDINARY_*` env vars are unset, uploads return 503 `{error: 'File storage is not configured'}` and avatars fall back to initials; nothing else fails.

## Review Focus

1. **A colleague reading a record must not receive hidden fields.** The response body for a `COLLEAGUE` must not contain the keys `personal`, `money` or `employment`. Leaving them out is required; sending them as `null` is not enough. Test in Task 9.
2. **Self-edit of a forbidden field.** An employee PATCHing their own `bankAccountNumber`, `designation` or `nationalId` gets 403 naming the field, and nothing is written. Test in Task 9.
3. **Manager loses a report.** When the last direct report is moved to another manager, that manager's next token refresh no longer carries the team permissions, and the team endpoints return 403. Test in Task 10.
4. **Reporting-line cycle.** Setting A's manager to B when B reports, directly or indirectly, to A is rejected with 409, and so is setting someone as their own manager. Test in Task 9.
5. **Import with bad rows.** A department import with duplicate names, blank names and more than `MAX_IMPORT_ROWS` rows returns per-row issues in preview, and commit writes nothing when any row has an error. Test in Task 7.

---

## File structure

```
packages/
  audit/src/{write.ts, query.ts, index.ts}            moved from apps/api/src/audit.ts + list query
  export/src/
    export/{types.ts, format.ts, safe.ts, csv.ts, xlsx.ts, respond.ts}
    import/{types.ts, cells.ts, parse.ts, template.ts, run.ts, http.ts}
    index.ts
  attachments/src/
    storage.ts            AttachmentStorage interface + configured() + memory fake
    cloudinary.ts         Cloudinary adapter
    upload.ts             multer middleware with size/type limits
    index.ts
  contracts/src/
    module.ts             NavGroup gains `order: number`
    department/{manifest.ts, schemas.ts}
    employee/{manifest.ts, schemas.ts, fields.ts}
  db/prisma/schema/{department.prisma, employee.prisma}   + core.prisma User.employee relation
  db/src/seed/{system-roles.ts, grant-new-permissions.ts}
apps/api/src/
  permission-providers.ts                              core hook
  modules/core-audit/{audit.routes.ts}                 GET /api/audit
  modules/department/{department.routes.ts, department.service.ts, department.import.ts, department.export.ts}
  modules/employee/
    employee.routes.ts  employee.controller.ts
    employee.access.ts         tiers, projection, writable fields
    employee.service.ts        create staff account, list, get, update, reporting-line check
    employee.changerequest.ts  national ID requests
    employee.exit.ts           exit details + account active toggle
    employee.team.ts           permission provider + team list
    employee.media.ts          documents + avatar
    employee.export.ts
apps/web/
  app/(app)/{departments, departments/import, employees, employees/new, employees/[id], employees/team, employees/id-requests, me, me/directory, settings/activity}/page.tsx
  modules/department/  modules/employee/  modules/settings/components/activity-table.tsx
```

---

### Task 1: Isolated test database

Plan 1 tests ran against the dev database and temporarily deactivated the seeded admin. From now on, tests run against a separate `erp_test` database.

**Files:**
- Modify: `docker/compose.dev.yaml` (init script creating database `erp_test`), `packages/db/.env.example` (+ `DATABASE_URL_TEST`), every package `vitest.config.ts` that loads `packages/db/.env`
- Create: `packages/db/scripts/prepare-test-db.ts`; root script `db:test:prepare`

**Interfaces:**
- Produces: `DATABASE_URL_TEST=postgresql://erp:erp@localhost:5433/erp_test`. The vitest configs set `process.env.DATABASE_URL = DATABASE_URL_TEST`. `pnpm db:test:prepare` runs `prisma migrate deploy` plus the seed's permission sync and system roles (no admin user) against `erp_test`.

- [ ] **Step 1:** Add the init SQL (`CREATE DATABASE erp_test OWNER erp`) via a `docker-entrypoint-initdb.d` mount. Also make `prepare-test-db.ts` create the database if it is missing, so existing volumes work.
- [ ] **Step 2:** Point every vitest config at `DATABASE_URL_TEST`. Remove the Plan 1 test code that temporarily deactivated the seeded admin; tests now create their own super admins.
- [ ] **Step 3:** Run `pnpm db:test:prepare && pnpm test`. Expected: all Plan 1 tests pass, and the dev DB's `User` rows are unchanged (row count before == after).
- [ ] **Step 4:** Commit `test(db): run tests against an isolated erp_test database`.

---

### Task 2: Nav order + grants for new permissions on existing databases

**Files:**
- Modify: `packages/contracts/src/module.ts` (`NavGroup.order: number`), `packages/contracts/src/core/manifest.ts` (Dashboard `order: 0`, Settings `order: 100`), `apps/web/lib/nav.ts` (sort by `order`), `packages/ui/src/nav/filter-nav.ts` (keeps input order)
- Modify: `packages/db/src/seed/system-roles.ts`, `packages/db/prisma/seed.ts`
- Create: `packages/db/src/seed/grant-new-permissions.ts`
- Test: `packages/db/src/seed/grant-new-permissions.test.ts`, `packages/contracts/src/registry.test.ts` (order)

**Interfaces:**
- Produces: `grantNewPermissions(db: Db, added: string[], roles: SystemRoleDef[]): Promise<void>`. For every key in `added` (the newly synced keys from `syncPermissions`), grant it to each system role whose `permissions` lists it. Existing grants and admin edits are never touched.
- Spec menu order: Dashboard 0, My Space 10, Employees 20, Departments 30, (Attendance 40, Leave 50, Payroll 60, Expenses 70, Assets 80, Exits 90 in later plans), Settings 100.

- [ ] **Step 1: Failing test:** role R lists `[a.x]`. Admin removes `a.x` from R. Seed runs again with `a.x` already synced: R still lacks `a.x`. Then key `a.y` is newly declared and R lists it: after seed, R has `a.y`.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(db): grant newly declared permissions to system roles; order nav groups`.

---

### Task 3: Permission providers (derived permissions)

**Files:**
- Create: `apps/api/src/permission-providers.ts`
- Modify: `apps/api/src/modules/auth/auth.service.ts` (`loadPublicUser` merges provider output)
- Test: `apps/api/src/permission-providers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type PermissionProvider = (db: Db, userId: string) => Promise<string[]>
  function registerPermissionProvider(p: PermissionProvider): void
  function derivedPermissions(db: Db, userId: string): Promise<string[]>   // union of all providers
  ```
  `loadPublicUser` returns `permissions = sort(unique(rolePermissions + derived))`. Providers are registered by modules at app build time (`createApp`). Core never imports a module.

- [ ] **Step 1: Failing test:** a provider returning `['x.team']` for user U only. U's login and refresh carry `x.team`; another user's do not. With no providers registered, the result equals the role permissions.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(auth): permission providers for derived permissions`.

---

### Task 4: `@erp/audit` kit + Activity Log

**Files:**
- Create: `packages/audit/src/{write.ts, query.ts, index.ts}`; move `apps/api/src/audit.ts` here and update its importers
- Create: `apps/api/src/modules/core-audit/audit.routes.ts` (mounted at `/audit`, core module folder: add `core-audit` to core's `folders`)
- Create: `apps/web/app/(app)/settings/activity/page.tsx`, `apps/web/modules/settings/components/activity-table.tsx`; add nav item Settings -> Activity Log `/settings/activity` (`audit.read`)
- Test: `packages/audit/src/query.test.ts`, `apps/api/src/modules/core-audit/audit.routes.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'IMPORT' | 'EXIT' | 'ACTIVATE' | 'DEACTIVATE'
  interface AuditEntry { entity: string; entityId: string; action: AuditAction; changedBy: string; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue }
  function writeAudit(tx: Tx, entry: AuditEntry): Promise<unknown>
  function diffFields<T extends object>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T> } | null   // only changed keys; null when nothing changed
  function listAudit(db: Db, q: { entity?: string; entityId?: string; changedBy?: string; cursor?: string; limit?: number }): Promise<{ items: AuditRow[]; nextCursor: string | null }>
  ```
  `GET /api/audit?entity=&entityId=&cursor=&limit=` (`audit.read`): newest first, `limit` default 50 and max 200. Each row includes the actor's email.

- [ ] **Step 1: Failing tests:** `diffFields({a:1,b:2},{a:1,b:3})` gives `{before:{b:2},after:{b:3}}`, and with no change gives `null`. `listAudit` pages with the cursor and has no duplicates across pages. The route returns 403 without `audit.read`.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS). The page shows time, actor, entity, action and the changed fields, with a "Load more" button.
- [ ] **Step 5:** Commit `feat(audit): shared audit kit and activity log`.

---

### Task 5: `@erp/export` kit (export + import)

**Files:**
- Create: `packages/export/src/export/*`, `packages/export/src/import/*` (port `HR-MNG-V1/server/src/utils/export` without `export.pdf.ts`, and `utils/import`, with their tests)

**Interfaces:**
- Produces (as HR-MNG-V1, names kept): `ExportSpec`, `ExportColumn`, `toXlsx(spec)`, `toCsvFile(spec)`, `sendExport(res, spec, format: 'xlsx' | 'csv')`, `ColumnSpec`, `MAX_IMPORT_ROWS = 2000`, `parseSheet(buffer, fileName)`, `buildImportGuide(columns)`, `buildTemplateXlsx(columns, sampleRows)`, `guideHandler`, `templateHandler`, `previewHandler`, `commitHandler`, `ImportPreview<T>`, `RowIssue`. The package depends on `express` types only for the handlers. PDF export comes in Plan 5 with payslips.
- `safeText` keeps the CSV/Excel formula-injection guard (cells starting with `= + - @` are prefixed).

- [ ] **Step 1:** Port the tests first; run and see them fail on missing modules.
- [ ] **Step 2:** Port the sources; run and see them pass.
- [ ] **Step 3:** Commit `feat(export): shared export and import kit`.

---

### Task 6: `@erp/attachments` kit

**Files:**
- Create: `packages/attachments/src/{storage.ts, cloudinary.ts, upload.ts, index.ts}`
- Test: `packages/attachments/src/{storage.test.ts, upload.test.ts}`

**Interfaces:**
- Produces:
  ```ts
  interface StoredFile { publicId: string; version: number; bytes: number; format: string; fileName: string }
  interface AttachmentStorage {
    upload(file: { buffer: Buffer; originalname: string; mimetype: string }, folder: string): Promise<StoredFile>
    signedUrl(publicId: string, opts?: { version?: number; expiresInSeconds?: number }): string   // default 300 s
    remove(publicId: string): Promise<void>
  }
  function getStorage(): AttachmentStorage | null          // null when CLOUDINARY_* unset
  function setStorageForTests(s: AttachmentStorage | null): void
  function memoryStorage(): AttachmentStorage              // test fake
  function uploadSingle(field: string, opts: { maxBytes: number; mimeTypes: string[] }): RequestHandler   // multer memory storage; 413 / 415 errors as AppError
  function requireStorage(): AttachmentStorage             // throws AppError(503, 'File storage is not configured')
  ```
  Env: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (all three or none, validated in `apps/api/src/env.ts`). Port the signing and upload logic from `HR-MNG-V1/server/src/modules/media/media.provider.ts`. Assets are uploaded as `authenticated` and delivered by signed URL only.

- [ ] **Step 1: Failing tests:** `memoryStorage` round-trips upload, signedUrl and remove. `getStorage()` is null without env. `uploadSingle` rejects a too-large file with 413 and a wrong mimetype with 415, and accepts a valid PDF.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(attachments): shared file storage kit`.

---

### Task 7: Department module (contracts, schema, api)

**Files:**
- Create: `packages/contracts/src/department/{manifest.ts, schemas.ts}`; register in `registry.ts`
- Create: `packages/db/prisma/schema/department.prisma` (`Department { id uuid, name unique, createdAt, updatedAt }`), migration `<ts>_department`
- Create: `apps/api/src/modules/department/{department.routes.ts, department.service.ts, department.import.ts, department.export.ts}`; mount `/departments`
- Modify: `system-roles.ts` (HR_ADMIN: all `department.*`; FINANCE_OFFICER: `department.read`)
- Test: `apps/api/src/modules/department/{department.routes.test.ts, department.import.test.ts}`

**Interfaces:**
- Manifest `department`, `deps: []`. Permissions: `department.read`, `department.manage`, `department.import`. Nav **Departments** (`order: 30`, icon `RiBuilding2Line`): Department List `/departments` (`department.read`), Import Departments `/departments/import` (`department.import`). Events: none.
- Endpoints (port behaviour from HR-MNG-V1 `department.*`):
  - `GET /api/departments` (`department.read`) returns `{id, name, employeeCount}[]` ordered by name. `employeeCount` is filled in by Task 8's schema; until then it is 0.
  - `POST` / `PATCH /:id` (`department.manage`) take `{name}`. Names are trimmed; a duplicate (case-insensitive) gets 409.
  - `DELETE /:id` (`department.manage`) gets 409 `{error: 'Department has employees'}` when it has employees, otherwise 204.
  - `GET /export?format=xlsx|csv` (`department.read`).
  - `GET /import/guide`, `GET /import/template`, `POST /import/preview`, `POST /import/commit` (`department.import`): one column `name`. Commit is all-or-nothing in one transaction and writes one `IMPORT` audit row.
  - Every mutation writes an audit row with `entity: 'DEPARTMENT'`.

- [ ] **Step 1: Failing tests:** CRUD statuses above. **Review Focus 5:** preview of `[Sales, sales, "", <2001 rows>]` returns issues for the duplicate, the blank and the row cap. Commit with any error returns 400 and writes zero rows. A clean commit writes N rows plus one audit row.
- [ ] **Step 2:** Schema plus migration (diff recipe).
- [ ] **Step 3-5:** Run (FAIL), implement, run (PASS).
- [ ] **Step 6:** Commit `feat(department): department module api`.

---

### Task 8: Employee schema and contracts

**Files:**
- Create: `packages/db/prisma/schema/employee.prisma`, migration `<ts>_employee`; modify `core.prisma` (`User.employee Employee?`) and `department.prisma` (`Department.employees Employee[]`)
- Create: `packages/contracts/src/employee/{manifest.ts, schemas.ts, fields.ts}`; register

**Interfaces:**
- Models (port from HR-MNG-V1 minus shift, deviceUserId, salaryStructure, sales, accounting and every later-module back-relation):
  - `Employee { id, userId unique, employeeCode unique, fullName, profilePicture?, dateOfBirth? @db.Date, gender?, nationalId?, bloodGroup?, maritalStatus?, phone?, presentAddress?, permanentAddress?, emergencyContact?, designation, departmentId, reportingManagerId?, employmentType, employmentStatus=ACTIVE, joiningDate @db.Date, officeLocation?, bankAccountNumber?, bankName?, bankRoutingNumber?, lastWorkingDay? @db.Date, exitReason?, exitNote?, createdAt, updatedAt, documents, changeRequests, @@index([reportingManagerId]), @@index([departmentId]) }`
  - Enums `EmploymentType`, `EmploymentStatus`, `ExitReason`, `DocumentType`, `EmployeeChangeField { NATIONAL_ID }`, `EmployeeChangeStatus { PENDING, APPROVED, REJECTED, CANCELLED }`: values as in HR-MNG-V1.
  - `Document` and `EmployeeChangeRequest` as in HR-MNG-V1.
- Manifest `employee`, `deps: ['core', 'department']` (core for `assertMayGrant` and `setUserStatus`). Permissions:
  - `employee.create`, `employee.read.all`, `employee.read.financial`, `employee.update`, `employee.exit`, `employee.export`.
  - `employee.documents.manage`, `employee.id_request.decide`.
  - `employee.team` (derived only; label "Team access (from direct reports)").
- `TEAM_PERMISSIONS = ['employee.team']` exported from `fields.ts`; later plans append team approvals.
- `fields.ts` exports `SELF_EDITABLE_FIELDS`, `HR_EDITABLE_FIELDS`, and the tier field groups `WORK_FIELDS`, `EMPLOYMENT_FIELDS`, `PERSONAL_FIELDS`, `MONEY_FIELDS`.
- Nav:
  - **My Space** (`order: 10`, `RiUserSmileLine`): My Profile `/me` (null), Directory `/me/directory` (null).
  - **Employees** (`order: 20`, `RiTeamLine`): Add Employee `/employees/new` (`employee.create`), Employee List `/employees` (`employee.read.all`), My Team `/employees/team` (`employee.team`), ID Change Requests `/employees/id-requests` (`employee.id_request.decide`).
- Events: `employee.joined`, `employee.bank_changed`, `employee.exited`, `employee.national_id_change_requested`, with Zod payloads (ids and dates only, no personal data).
- Schemas: `createEmployeeSchema` (email, fullName, designation, departmentId, reportingManagerId?, employmentType, joiningDate `YYYY-MM-DD`, employeeCode?, roleIds?), `updateEmployeeSchema` (partial over all writable fields), `employeeViewSchema` (`{id, work, employment?, personal?, money?, editableFields: string[]}`; optional sections are omitted rather than nulled), `exitSchema`, `idChangeRequestSchema`.
- System roles: HR_ADMIN gets every `employee.*` except `employee.team`; FINANCE_OFFICER gets `employee.read.financial` and `employee.export`.

- [ ] **Step 1:** Write schema plus migration, run `db:generate` and `db:test:prepare`. Expected: migrate applies.
- [ ] **Step 2:** Manifest plus schemas; the registry test gains "employee depends on department and orders after it".
- [ ] **Step 3:** Run `pnpm --filter @erp/contracts test && pnpm --filter @erp/db test`. Expected: PASS.
- [ ] **Step 4:** Commit `feat(employee): employee schema and contracts`.

---

### Task 9: Employee api - create, list, read, update, access tiers

**Files:**
- Create: `apps/api/src/modules/employee/{employee.routes.ts, employee.controller.ts, employee.access.ts, employee.service.ts}`; mount `/employees`
- Test: `apps/api/src/modules/employee/{employee.access.test.ts, employee.routes.test.ts}`

**Interfaces:**
- Consumes: `departmentExists(db, id)` exported by `department.service.ts` (a declared dependency), `writeAudit`, `diffFields`, `emit`, `hashPassword`, `generateTemporaryPassword`, `assertMayGrant` from `users.service.ts`. That last one comes from `core`, which is in `employee.deps` (Task 8).
- Produces:
  - `visibilityTier(viewer: AccessTokenPayload, subject: {userId, reportingManagerId}, viewerEmployeeId: string | null): Tier` and `projectEmployee(e, tier): EmployeeView` (omits sections per Global Constraints).
  - `writableFieldsFor(tier, viewerPermissions): ReadonlySet<string>`.
  - `employeeIdForUser(db, userId): Promise<string | null>` (exported for later modules).
  - `POST /api/employees` (`employee.create`):
    - Creates User + Employee in one transaction, with roles `EMPLOYEE` plus any `roleIds`, which must pass `assertMayGrant`.
    - `employeeCode` is auto-generated `EMP-0001` style when omitted; a duplicate gets 409.
    - Returns 201 `{employee: EmployeeView, temporaryPassword}`.
    - Emits `employee.joined` and writes an audit row.
  - `GET /api/employees` (`employee.read.all` or `employee.read.financial`) returns `EmployeeView[]` at the viewer's tier, with `?q=&departmentId=&status=` filters.
  - `GET /api/employees/me` returns the viewer's own record at the `SELF` tier, or 404 when there is no employee record.
  - `GET /api/employees/directory` (any signed-in user) returns active employees at the `COLLEAGUE` tier, filterable by `?q=&departmentId=`.
  - `GET /api/employees/:id` returns the record at the viewer's tier.
  - `PATCH /api/employees/:id`:
    - Every key in the body must be in `writableFieldsFor`, else 403 `{error: 'Field not editable: <name>'}`.
    - Reporting-line change runs `assertNoReportingCycle(db, employeeId, newManagerId)`, which returns 409 `{error: 'Reporting line would form a cycle'}`.
    - A bank field change emits `employee.bank_changed`.
    - Writes an audit row with only the changed fields.

- [ ] **Step 1: Failing tests:**
  - Tier matrix, unit-tested on `visibilityTier` and `projectEmployee`. **Review Focus 1:** the `COLLEAGUE` view has no `personal`, `money` or `employment` keys.
  - Create: 201; duplicate email gets 409; an unknown department gets 400.
  - **Review Focus 2:** self-PATCH of `bankAccountNumber`, `designation` or `nationalId` gets 403 naming the field, and the row is unchanged. Self-PATCH of `phone` gets 200.
  - **Review Focus 4:** A->B->C, then setting C's manager to A gets 409, and so does setting A's manager to A.
  - A FINANCE viewer sees `money` but not `personal`.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(employee): create, read, update with access tiers`.

---

### Task 10: Employee api - team provider, change requests, exit, account, export

**Files:**
- Create: `apps/api/src/modules/employee/{employee.team.ts, employee.changerequest.ts, employee.exit.ts, employee.export.ts}`
- Modify: `apps/api/src/app.ts` (register the team permission provider), `employee.routes.ts`
- Test: `apps/api/src/modules/employee/{employee.team.test.ts, employee.changerequest.test.ts, employee.exit.test.ts}`

**Interfaces:**
- `teamPermissionProvider: PermissionProvider` returns `TEAM_PERMISSIONS` when the user's employee has at least one subordinate with `employmentStatus` in `ACTIVE` or `ON_LEAVE`, else `[]`.
- `GET /api/employees/team` (`employee.team`) lists direct reports at the `MANAGER` tier.
- National ID (port `employee.changerequest.ts`):
  - `POST /api/employees/national-id-requests {newValue}` (self): one pending request per employee, a second gets 409. Emits `employee.national_id_change_requested`.
  - `PATCH /api/employees/national-id-requests/:id/cancel` (owner, only while pending).
  - `GET /api/employees/national-id-requests?status=` (`employee.id_request.decide`).
  - `PATCH /api/employees/national-id-requests/:id/decide {approve: boolean, note?}` (`employee.id_request.decide`). Approve writes `nationalId` and audits; nobody may decide their own request (403).
- `PATCH /api/employees/:id/exit` (`employee.exit`):
  - Body `{lastWorkingDay, exitReason, exitNote?}`. Sets status `RESIGNED`, or `TERMINATED` for TERMINATION, DISMISSAL, DISCHARGE and RETRENCHMENT; the mapping comes from HR-MNG-V1.
  - On or after `lastWorkingDay` the user is deactivated by the worker; until the worker exists (Plan 7), deactivate immediately when `lastWorkingDay <= today`.
  - Emits `employee.exited`. Settlement freezing comes in Plan 5.
- `PATCH /api/employees/:id/account {isActive}` (`employee.update`) goes through core's `setUserStatus`, so the last-admin and super-admin guards apply.
- `GET /api/employees/export?format=` (`employee.export`) exports only the columns the viewer's tier may see.

- [ ] **Step 1: Failing tests:**
  - **Review Focus 3:** manager M with one report has `employee.team` after refresh. Move the report to another manager, refresh, and M lacks it, with `/employees/team` returning 403.
  - Change request lifecycle, including the second pending request getting 409 and self-decide getting 403.
  - Exit sets the status and emits the event.
  - The export as FINANCE has no personal columns.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(employee): team access, id change requests, exit, export`.

---

### Task 11: Employee api - documents and avatar

**Files:**
- Create: `apps/api/src/modules/employee/employee.media.ts`; routes in `employee.routes.ts`
- Test: `apps/api/src/modules/employee/employee.media.test.ts` (uses `setStorageForTests(memoryStorage())`)

**Interfaces (port `employee.media.ts`):**
- `GET /api/employees/:id/documents`: SELF, or holders of `employee.read.all` / `employee.documents.manage`.
- `POST /api/employees/:id/documents` (`employee.documents.manage`, multipart `file`, `type`): pdf/jpeg/png up to 10 MB.
- `GET /api/employees/:id/documents/:docId/url` returns `{url}` signed for 300 s.
- `DELETE /api/employees/:id/documents/:docId` (`employee.documents.manage`) removes the stored file, then the row, and audits.
- `PATCH` / `DELETE /api/employees/:id/avatar`: SELF or `employee.update`; jpeg/png/webp up to 2 MB; stored as `publicId:version` (`packAvatar` / `unpackAvatar`). Views expose `avatarUrl`, or `null` when storage is unconfigured.
- Storage unconfigured: uploads get 503 and listing still works.

- [ ] **Step 1: Failing tests:** upload, list, signed URL, delete; a colleague listing someone's documents gets 403; a wrong type gets 415; with storage unset, upload gets 503 and `avatarUrl` is null.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(employee): documents and avatar`.

---

### Task 12: Web - departments

**Files:**
- Create: `apps/web/modules/department/{api.ts, hooks.ts, components/{department-table.tsx, department-form-dialog.tsx, import-wizard.tsx}}`, `apps/web/app/(app)/departments/page.tsx`, `apps/web/app/(app)/departments/import/page.tsx`
- Create (reusable, in `@erp/ui`): `packages/ui/src/components/data-table.tsx` (sortable columns, empty and loading states), `packages/ui/src/components/import-wizard.tsx` (guide -> template download -> upload -> preview with per-row issues -> commit), `packages/ui/src/components/export-menu.tsx` (xlsx/csv). Later modules reuse all three.
- Test: `packages/ui/src/components/import-wizard.test.tsx` (vitest + @testing-library/react, jsdom)

**Interfaces:**
- `ImportWizard` props: `{ guideUrl, templateUrl, preview(file): Promise<ImportPreview>, commit(file): Promise<{count}>, onDone() }`.
- The Department List page has the table, create/rename dialog, delete with confirm (shows the 409 message), and the export menu. Actions are gated with `RequirePermission`.

- [ ] **Step 1: Failing test:** the wizard disables "Import" while the preview has issues, and enables it when the preview is clean.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(web): departments pages and shared table/import/export components`.

---

### Task 13: Web - employees, team, ID requests

**Files:**
- Create: `apps/web/modules/employee/{api.ts, hooks.ts, components/{employee-table.tsx, employee-form.tsx, employee-profile.tsx, documents-panel.tsx, exit-dialog.tsx, id-request-table.tsx, avatar.tsx}}`
- Create pages: `employees/page.tsx`, `employees/new/page.tsx`, `employees/[id]/page.tsx`, `employees/team/page.tsx`, `employees/id-requests/page.tsx`
- Test: `apps/web/modules/employee/components/employee-profile.test.tsx`

**Interfaces:**
- `EmployeeProfile` props: `{ employee: EmployeeView, onSave(patch), canExit, canManageDocuments }`. It renders only the sections present in the view, and edit controls only for `editableFields`. It is reused by `/me` in Task 14.
- `employees/new`: form, then a one-time temporary password dialog that can't be dismissed (same pattern as create-user).
- `employees/[id]`: profile, documents panel, exit dialog, account toggle.
- `Avatar`: shows the image, or initials when `avatarUrl` is null.

- [ ] **Step 1: Failing test:** a `COLLEAGUE` view renders no Personal or Bank sections. `editableFields: ['phone']` renders exactly one editable input.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(web): employee pages`.

---

### Task 14: Web - My Profile and Directory; browser check; docs

**Files:**
- Create pages: `apps/web/app/(app)/me/page.tsx` (`EmployeeProfile` with the SELF view, national-ID request card, avatar upload), `apps/web/app/(app)/me/directory/page.tsx` (search, department filter, cards with avatar, name, designation, department, email, phone)
- Modify: `CLAUDE.md` (permission providers, test DB, shared kits), `docs/superpowers/plans/2026-10-27-erp-plan-1-followups.md` (mark carried items done)
- Create: `docs/superpowers/plans/2026-10-27-erp-plan-2-followups.md` at the end

- [ ] **Step 1:** Implement the pages. A user with no employee record (the seeded admin) sees "No employee profile is linked to this account" on `/me`.
- [ ] **Step 2:** From root, run `pnpm build && pnpm lint && pnpm typecheck && pnpm test`. Expected: all green.
- [ ] **Step 3 (controller browser check):**
  - As admin, create department "Engineering", then employees A (manager) and B (reporting to A).
  - Log in as B: My Profile shows personal fields and lets B edit phone but not bank fields; Directory lists A.
  - Log in as A: the sidebar shows Employees -> My Team, and B appears there without personal fields.
  - Sidebar order: Dashboard, My Space, Employees, Departments, Settings.
  - Take screenshots.
- [ ] **Step 4:** Commit `feat(web): my profile and directory` and `docs: plan 2 notes`.
- [ ] **Step 5:** Push the branch to both remotes and open the PR into `dev` with a `Deploy impact` section:
  - New env vars `CLOUDINARY_*` (optional) and `DATABASE_URL_TEST`.
  - Migrations `department` and `employee`.
  - Run `db:seed`, which grants the new permissions to system roles.
