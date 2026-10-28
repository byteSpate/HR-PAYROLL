# ERP Plan 2 - Access Model, Employee and Department Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two outcomes:
- Replace Plan 1's role model with the revised access model: one fixed super admin, any number of admins, one role per staff user, and scoped permissions.
- On top of that, HR can create employees (with their login), organise them into departments and manage their records and documents. Every employee can see and edit their own profile and browse a staff directory, and managers get team access from their direct reports.

**Architecture:** First the access model (Tasks 0A and 0B), because every later module's permissions depend on it. Then two modules, `department` and `employee` (`employee` depends on `core` and `department`), built the Plan 1 way. Three shared kits are extracted because these modules are their first users: `@erp/audit`, `@erp/export` (Excel/CSV export and import) and `@erp/attachments` (Cloudinary file storage). A permission-provider hook in core lets `employee` add `team` scope for managers without core importing `employee`.

**Tech Stack:** as Plan 1. New dependencies, same versions as `HR-MNG-V1/server`: `exceljs`, `multer` + `@types/multer`, `cloudinary`.

**Spec:** `docs/superpowers/specs/2026-10-27-erp-monorepo-design.md` (section 6 is the access model and is binding)
**Follow-ups carried in:** `docs/superpowers/plans/2026-10-27-erp-plan-1-followups.md`

## Global Constraints

Everything in Plan 1's Global Constraints, plus:

- Git: branch `feat/employee-department` (from `dev`). Conventional Commits, plain ASCII, no AI attribution (`docs/GIT_WORKFLOW.md`). Push to both remotes; PR into `dev`.
- **Access model (spec section 6):**
  - Access levels `SUPER_ADMIN` (exactly one, DB-enforced), `ADMIN` (any number) and `STANDARD`. Super admin and admins hold every permission at scope `all` implicitly. Nothing is stored for them, and new modules' permissions apply to them automatically.
  - Only the super admin appoints or removes admins. Nobody, through the app, can deactivate, edit or change the access level of the super admin. Admins cannot act on other admins.
  - `STANDARD` users have at most one role (`User.roleId`). A role is a set of grants `{permission, scope | null}`.
  - Scopes are `own < team < department < all`; a wider grant covers narrower ones. `own` is implicit for users with an employee record. `team` is implicit for users with active direct reports, on permissions marked `managerDefault`. `department` and `all` come only from the role.
  - Permission strings in checks: `'key'` means "holds key at any scope or on/off"; `'key:scope'` means "holds key at that scope or wider".
  - Grant rule: a grantor may only grant `{permission, scope}` pairs they hold at that scope or wider. Admins and the super admin satisfy this for every pair.
- Port behaviour from `HR-MNG-V1/server/src/modules/{employee,department,media}` and `src/utils/{export,import}`, dropping sales, accounting, salary structure, shift, device ID, insights and email invites. Those must not appear as columns or code now.
- **Employee visibility tiers** (ported from `employee.access.ts`, now scope-based). The first match wins:
  1. `SELF`: the viewer's own record.
  2. `FULL`: `scopeFor('employee.read')` reaches the subject at `department` (same department) or `all`.
  3. `FINANCE`: the viewer holds `employee.read.financial`.
  4. `MANAGER`: the subject reports directly to the viewer (implicit `team` scope).
  5. `COLLEAGUE`: everyone else.
- **Field visibility per tier:**
  - Work identity: every tier.
  - Employment: every tier except `COLLEAGUE`.
  - Personal: `SELF` and `FULL`.
  - Money (bank fields): `SELF`, `FULL` and `FINANCE`.
  Hidden sections are omitted from the JSON, not sent as `null`.
- **Writable fields:** `SELF` gets the self-editable fields, as in HR-MNG-V1. A viewer whose `employee.update` scope reaches the subject gets those plus the HR fields. National ID changes only through change requests. Nobody can edit their own bank fields.
- Cloudinary is optional. When `CLOUDINARY_*` is unset, uploads return 503 `{error: 'File storage is not configured'}` and avatars fall back to initials.
- Per-client module enable/disable is not part of the app. Do not add any toggle or flag for it.

## Review Focus

1. **Super admin is untouchable through the app.** Deactivating, editing roles of, changing the access level of or deleting the super admin returns 403 for every caller, including the super admin acting on themselves. A second `SUPER_ADMIN` row is rejected by the database. Tests in Task 0A.
2. **Admins cannot escalate.** An admin calling the access-level endpoint gets 403. An admin deactivating another admin gets 403. A `STANDARD` user with `user.manage` cannot assign a role containing a grant they lack, either a higher scope or a missing key. Tests in Task 0A.
3. **A colleague reading a record must not receive hidden fields.** The `COLLEAGUE` response has no `personal`, `money` or `employment` keys. Test in Task 9.
4. **Manager loses a report.** After the last direct report moves away, the manager's next refresh drops every implicit `:team` grant, and the team endpoints return 403. Test in Task 10.
5. **Reporting-line cycle and import with bad rows.**
   - Setting a manager that would form a cycle, or making someone their own manager, gives 409 (Task 9).
   - A department import with duplicates, blanks or too many rows reports per-row issues and writes nothing on commit (Task 7).

---

## File structure

```
packages/
  auth/src/access.ts                    can(), scopeFor(), Scope, AccessLevel (browser-safe, exported via ./permissions)
  audit/src/{write.ts, query.ts, index.ts}
  export/src/{export/*, import/*, index.ts}
  attachments/src/{storage.ts, cloudinary.ts, upload.ts, index.ts}
  contracts/src/
    module.ts                           PermissionDef {label, scopes?, managerDefault?}; NavGroup.order; NavItem.permission accepts 'key' or 'key:scope'
    core/{manifest.ts, schemas.ts}      access-level + single-role schemas
    department/{manifest.ts, schemas.ts}
    employee/{manifest.ts, schemas.ts, fields.ts}
  db/
    prisma/schema/{core.prisma, department.prisma, employee.prisma}
    scripts/{prepare-test-db.ts, admin-transfer.ts, admin-reset-password.ts}
    src/seed/{starter-roles.ts, sync-permissions.ts, grant-new-permissions.ts}
apps/api/src/
  permission-providers.ts
  middleware/require-permission.ts      uses can()
  modules/auth/*                        PublicUser {accessLevel, role, grants}
  modules/users/{users.service.ts, roles.service.ts, access-level.ts, guards.ts}
  modules/core-audit/audit.routes.ts
  modules/department/*
  modules/employee/*
apps/web/
  lib/session.tsx, modules/settings/*   access level, single role, scope pickers
  app/(app)/{departments, departments/import, employees, employees/new, employees/[id], employees/team, employees/id-requests, me, me/directory, settings/activity}/page.tsx
  modules/department/  modules/employee/
```

---

### Task 0A: Access model rework - data, auth, api

**Files:**
- Modify: `packages/db/prisma/schema/core.prisma`, plus a migration `<ts>_access_model` with a hand-written data-mapping section
- Modify: `packages/contracts/src/module.ts`, `packages/contracts/src/core/{manifest.ts, schemas.ts}`, `packages/contracts/src/registry.ts` (`allPermissions` returns scopes)
- Create: `packages/auth/src/access.ts`; modify `packages/auth/src/{tokens.ts, permissions.ts, index.ts}`
- Modify: `apps/api/src/middleware/require-permission.ts`, `apps/api/src/modules/auth/auth.service.ts`, `apps/api/src/modules/users/*`. Delete `last-admin.ts`; create `access-level.ts` and `guards.ts`.
- Modify: `packages/db/src/seed/*` (`system-roles.ts` becomes `starter-roles.ts`), `packages/db/prisma/seed.ts`
- Create: `packages/db/scripts/{admin-transfer.ts, admin-reset-password.ts}`; root scripts `admin:transfer`, `admin:reset-password`
- Test: `packages/auth/src/access.test.ts`, `apps/api/src/modules/users/{users.routes.test.ts, roles.routes.test.ts, access-level.test.ts}`, `apps/api/src/modules/auth/auth.routes.test.ts`, `packages/db/src/seed/*.test.ts`

**Interfaces:**
- Schema:
  - `enum AccessLevel { SUPER_ADMIN ADMIN STANDARD }` and `enum Scope { OWN TEAM DEPARTMENT ALL }`.
  - `User` gains `accessLevel AccessLevel @default(STANDARD)` and `roleId String?` (relation `Role`, `onDelete: Restrict`).
  - `UserRole` is dropped. `Role.isSystem` is dropped.
  - `RolePermission` gains `scope Scope?` (null means on/off); the primary key stays `[roleId, permissionKey]`.
  - The migration adds `CREATE UNIQUE INDEX one_super_admin ON "User" ("accessLevel") WHERE "accessLevel" = 'SUPER_ADMIN'`.
- Migration data mapping, in this order:
  1. The earliest-created active user holding the old `SUPER_ADMIN` role becomes `SUPER_ADMIN`.
  2. Other holders of that role become `ADMIN`.
  3. Each other user's `roleId` = their first non-`EMPLOYEE` role by name, else `EMPLOYEE`, else null.
  4. Existing grants get `scope = ALL` where the permission is scoped.
  5. Delete the `SUPER_ADMIN` role, then drop `UserRole`.
- Contracts:
  ```ts
  type Scope = 'own' | 'team' | 'department' | 'all'
  interface PermissionDef { label: string; scopes?: readonly Scope[]; managerDefault?: boolean }   // scopes omitted = on/off
  ModuleManifest.permissions: Record<string, PermissionDef>
  NavItem.permission: string | null     // 'key' or 'key:scope'
  NavGroup.order: number
  ```
  Core permissions (`user.manage`, `role.manage`, `settings.manage`, `audit.read`) are on/off.
- `@erp/auth/permissions` (browser-safe):
  ```ts
  type AccessLevel = 'SUPER_ADMIN' | 'ADMIN' | 'STANDARD'
  interface AccessContext { accessLevel: AccessLevel; grants: readonly string[] }   // grants: 'key' (on/off) or 'key:scope'
  function can(ctx: AccessContext, required: string): boolean
  function scopeFor(ctx: AccessContext, key: string): Scope | null   // widest held; 'all' for SUPER_ADMIN and ADMIN
  function covers(held: Scope, needed: Scope): boolean
  ```
- Token payload becomes `{ sub, accessLevel, grants }`, with an empty `grants` array for SUPER_ADMIN and ADMIN. `requireAuth` validates the new shape. `requirePermission(required)` uses `can`.
- `PublicUser` becomes `{ id, email, displayName, isActive, mustChangePassword, accessLevel, role: {id, name} | null, grants: string[] }`. `loadPublicUser` builds grants as role grants plus `derivedGrants` from permission providers (Task 3 supplies the hook; until then there are none).
- Users API:
  - `PATCH /api/users/:id/role {roleId: string | null}` (`user.manage`). The target must be `STANDARD`. The role's grants must pass `assertMayGrant(caller, grants)`.
  - `PATCH /api/users/:id/access-level {accessLevel: 'ADMIN' | 'STANDARD'}`: super admin only, target not the super admin. Promoting clears `roleId`.
  - `POST /api/users` takes `{email, displayName, roleId?}` and always creates `STANDARD` users.
  - `PATCH /:id/status`:
    - A target that is the super admin gets 403.
    - A target that is an admin gets 403 unless the caller is the super admin.
  - `GET /api/users/role-options` stays.
  - `guards.ts` exports `assertCanActOn(caller: AccessContext & {sub}, target: {id, accessLevel})` and `assertMayGrant(caller, grants: {permissionKey, scope}[])`.
- Roles API:
  - Grants are `{permissionKey, scope | null}[]`. A scope must be one the permission declares; on/off permissions take null. Anything else gets 400.
  - The escalation guard is scope-aware.
  - Deleting a role that has users gets 409.
- Seed:
  - `STARTER_ROLES` holds HR Admin, Finance Officer and Employee, each with grants `{key, scope}`. They are created only when no role of that name exists.
  - The super admin is created from `SEED_ADMIN_*` only when no `SUPER_ADMIN` user exists.
- CLI:
  - `pnpm admin:transfer <email>` makes that active user `SUPER_ADMIN` and the old one `ADMIN`, in one transaction.
  - `pnpm admin:reset-password` sets a new temporary password for the super admin and prints it once.

- [ ] **Step 1: Failing tests:**
  - `can` and `scopeFor`:
    - With grant `leave.approve:department`: `can('leave.approve:team')` is true, `can('leave.approve:all')` is false, and `scopeFor` is `'department'`.
    - `ADMIN` gives `can('x.y:all')` true for any key.
    - On/off grant `user.manage`: `can('user.manage')` is true.
  - **Review Focus 1:**
    - Every mutation on the super admin returns 403, including the super admin acting on themselves.
    - A raw insert of a second `SUPER_ADMIN` throws a unique violation.
  - **Review Focus 2:**
    - An admin calling the access-level endpoint gets 403.
    - An admin deactivating an admin gets 403. The super admin promoting a user to admin gets 200, and that user then passes `can('anything:all')`.
    - A `STANDARD` user with `user.manage` and `employee.read:department` assigning a role with `employee.read:all` gets 403.
  - Roles:
    - A scope not declared by the permission gives 400. A scope on an on/off permission gives 400.
  - Migration mapping, tested in `prepare-test-db` fixtures: old SUPER_ADMIN-role holders map to SUPER_ADMIN plus ADMIN.
  - Seed is idempotent.
- [ ] **Step 2:** Write the schema and migration (diff recipe, then append the data-mapping SQL by hand and read it); apply it to dev and test.
- [ ] **Step 3-5:** Run (FAIL), implement, run (PASS). Remove dead code: `last-admin.ts`, `UserRole` usage, `SYSTEM_ROLES`.
- [ ] **Step 6:** Commit `feat(auth)!: one super admin, admins, single role and scoped permissions` with footer `BREAKING CHANGE: token, PublicUser and roles API shapes changed`.

---

### Task 0B: Access model rework - web

**Files:**
- Modify: `apps/web/lib/session.tsx`, `apps/web/modules/settings/components/*` (users table, create-user form, role select, role form, permission picker), `apps/web/modules/settings/require-permission.tsx`, `packages/ui/src/nav/filter-nav.ts` (uses `can`)
- Test: `packages/ui/src/nav/filter-nav.test.ts`, `apps/web/modules/settings/components/permission-picker.test.tsx`

**Interfaces:**
- `<RequirePermission permission="key[:scope]">` and nav filtering call `can(session, ...)`.
- Users page:
  - Columns: Name, Email, Access (`Super admin` / `Admin` / role name), Status.
  - "Make admin" / "Remove admin" actions show only for the super admin. The super admin's own row shows no actions.
  - Admin rows show no actions for admins.
  - The role is a single select.
- Role form (`PermissionPicker`):
  - One row per permission, grouped by module.
  - On/off permissions get a checkbox. Scoped permissions get a select of "Off" plus the permission's declared scopes, excluding `own` and `team`, which are implicit.
  - A small note under the module says "Everyone can act on their own records; managers act on their team automatically".
- `filterNav(groups, ctx, pathname)` takes an `AccessContext`.

- [ ] **Step 1: Failing tests:**
  - Picker: a permission with scopes `['team','department','all']` renders a select with Off, Department and All. An on/off permission renders a checkbox.
  - `filterNav`: an item with `employee.read:team` is visible to a user holding `employee.read:department`.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(web): access levels, single role and scope picker`.

---

### Task 1: Isolated test database

**Files:**
- Modify: `docker/compose.dev.yaml` (init SQL `CREATE DATABASE erp_test OWNER erp` via `docker-entrypoint-initdb.d`), `packages/db/.env.example` (+ `DATABASE_URL_TEST=postgresql://erp:erp@localhost:5433/erp_test`), every `vitest.config.ts` that loads `packages/db/.env`
- Create: `packages/db/scripts/prepare-test-db.ts`; root script `db:test:prepare`

**Interfaces:**
- Vitest configs set `process.env.DATABASE_URL = DATABASE_URL_TEST`.
- `db:test:prepare` creates the database if it is missing, runs `migrate deploy`, permission sync and the starter roles, with no users.

- [ ] **Step 1:** Implement. Tests create their own super admin. They may use a helper `ensureTestSuperAdmin()` in the api test utils, because the DB allows only one.
- [ ] **Step 2:** Run `pnpm db:test:prepare && pnpm test`. Expected: green, and the dev DB `User` row count is unchanged before and after.
- [ ] **Step 3:** Commit `test(db): run tests against an isolated erp_test database`.

Note: execute Task 1 before Task 0A (Task 0A's tests rely on it). The order is 1, 0A, 0B, 2, ...

---

### Task 2: Nav order + grants for new permissions on existing databases

**Files:**
- Modify: `packages/contracts/src/core/manifest.ts` (Dashboard `order: 0`, Settings `order: 100`), `apps/web/lib/nav.ts` (sort by `order`)
- Create: `packages/db/src/seed/grant-new-permissions.ts`; modify `seed.ts`
- Test: `packages/db/src/seed/grant-new-permissions.test.ts`

**Interfaces:**
- `grantNewPermissions(db, added: string[], roles: StarterRoleDef[])`: for each newly synced key, grant it to the starter roles that list it, by role name, at the listed scope. An existing grant or an admin's removal of an older key is never touched.
- Menu order: Dashboard 0, My Space 10, Employees 20, Departments 30, (later: Attendance 40, Leave 50, Payroll 60, Expenses 70, Assets 80, Exits 90), Settings 100.

- [ ] **Step 1: Failing test:**
  - An admin removed `a.x` from HR Admin; seed re-run leaves it removed.
  - A newly declared `a.y:all` that is listed for HR Admin is granted on the next seed.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(db): grant newly declared permissions to starter roles; order nav groups`.

---

### Task 3: Permission providers (derived grants)

**Files:**
- Create: `apps/api/src/permission-providers.ts`; modify `auth.service.ts`
- Test: `apps/api/src/permission-providers.test.ts`

**Interfaces:**
- ```ts
  type GrantProvider = (db: Db, userId: string) => Promise<string[]>   // returns 'key:scope' grants
  function registerGrantProvider(p: GrantProvider): void
  function derivedGrants(db: Db, userId: string): Promise<string[]>
  ```
- `loadPublicUser` returns `grants = unique(roleGrants + derivedGrants)`, sorted.
- Providers are skipped for SUPER_ADMIN and ADMIN, which already hold everything.

- [ ] **Step 1: Failing test:** a provider returning `['x.y:team']` for user U shows up in U's login and refresh only. With no providers, grants equal the role grants.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(auth): grant providers for derived scopes`.

---

### Task 4: `@erp/audit` kit + Activity Log

**Files:**
- Create: `packages/audit/src/{write.ts, query.ts, index.ts}`; move `apps/api/src/audit.ts` there and update importers
- Create: `apps/api/src/modules/core-audit/audit.routes.ts` (mount `/audit`; add `core-audit` to core's lint `folders`)
- Create: `apps/web/app/(app)/settings/activity/page.tsx`, `apps/web/modules/settings/components/activity-table.tsx`; nav Settings -> Activity Log `/settings/activity` (`audit.read`)
- Test: `packages/audit/src/query.test.ts`, `apps/api/src/modules/core-audit/audit.routes.test.ts`

**Interfaces:**
- ```ts
  type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'CANCEL' | 'IMPORT' | 'EXIT' | 'ACTIVATE' | 'DEACTIVATE'
  interface AuditEntry { entity: string; entityId: string; action: AuditAction; changedBy: string; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue }
  function writeAudit(tx: Tx, entry: AuditEntry): Promise<unknown>
  function diffFields<T extends object>(before: T, after: Partial<T>): { before: Partial<T>; after: Partial<T> } | null
  function listAudit(db: Db, q: { entity?: string; entityId?: string; changedBy?: string; cursor?: string; limit?: number }): Promise<{ items: AuditRow[]; nextCursor: string | null }>
  ```
- `GET /api/audit` (`audit.read`): newest first; `limit` default 50, max 200; rows include the actor's email.

- [ ] **Step 1: Failing tests:**
  - `diffFields({a:1,b:2},{a:1,b:3})` gives `{before:{b:2},after:{b:3}}`; with no change it gives `null`.
  - Cursor paging has no duplicates across pages.
  - The route returns 403 without `audit.read`.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS). The page has a "Load more" button.
- [ ] **Step 5:** Commit `feat(audit): shared audit kit and activity log`.

---

### Task 5: `@erp/export` kit (export + import)

**Files:**
- Create: `packages/export/src/export/*`, `packages/export/src/import/*`, ported with their tests from `HR-MNG-V1/server/src/utils/export` (without `export.pdf.ts`) and `utils/import`

**Interfaces:**
- Names as in HR-MNG-V1:
  - Export: `ExportSpec`, `ExportColumn`, `toXlsx`, `toCsvFile`, `sendExport(res, spec, 'xlsx' | 'csv')`.
  - Import: `ColumnSpec`, `MAX_IMPORT_ROWS = 2000`, `parseSheet`, `buildImportGuide`, `buildTemplateXlsx`, `guideHandler`, `templateHandler`, `previewHandler`, `commitHandler`, `ImportPreview<T>`, `RowIssue`.
- `safeText` keeps the formula-injection guard.
- PDF export comes in Plan 5.

- [ ] **Step 1:** Port the tests and run them (FAIL). **Step 2:** Port the sources and run them (PASS). **Step 3:** Commit `feat(export): shared export and import kit`.

---

### Task 6: `@erp/attachments` kit

**Files:**
- Create: `packages/attachments/src/{storage.ts, cloudinary.ts, upload.ts, index.ts}`
- Test: `packages/attachments/src/{storage.test.ts, upload.test.ts}`

**Interfaces:**
- ```ts
  interface StoredFile { publicId: string; version: number; bytes: number; format: string; fileName: string }
  interface AttachmentStorage {
    upload(file: { buffer: Buffer; originalname: string; mimetype: string }, folder: string): Promise<StoredFile>
    signedUrl(publicId: string, opts?: { version?: number; expiresInSeconds?: number }): string   // default 300 s
    remove(publicId: string): Promise<void>
  }
  function getStorage(): AttachmentStorage | null
  function setStorageForTests(s: AttachmentStorage | null): void
  function memoryStorage(): AttachmentStorage
  function requireStorage(): AttachmentStorage   // AppError(503, 'File storage is not configured')
  function uploadSingle(field: string, opts: { maxBytes: number; mimeTypes: string[] }): RequestHandler   // 413 / 415
  ```
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` must be set all together or not at all (validated in `apps/api/src/env.ts`).
- Port the provider from `HR-MNG-V1/server/src/modules/media/media.provider.ts`. Uploads use the `authenticated` type and are served only through signed URLs.

- [ ] **Step 1: Failing tests:**
  - The memory storage round-trips.
  - `getStorage()` is null without env.
  - `uploadSingle` returns 413 for an oversized file and 415 for the wrong type, and accepts a PDF.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(attachments): shared file storage kit`.

---

### Task 7: Department module (contracts, schema, api)

**Files:**
- Create: `packages/contracts/src/department/{manifest.ts, schemas.ts}`; register
- Create: `packages/db/prisma/schema/department.prisma` (`Department { id uuid, name unique, createdAt, updatedAt }`), migration `<ts>_department`
- Create: `apps/api/src/modules/department/{department.routes.ts, department.service.ts, department.import.ts, department.export.ts}`; mount `/departments`
- Modify: `starter-roles.ts` (HR Admin: `department.read`, `department.manage`, `department.import`; Finance Officer: `department.read`)
- Test: `apps/api/src/modules/department/{department.routes.test.ts, department.import.test.ts}`

**Interfaces:**
- Manifest `department`, `deps: ['core']`.
  - Permissions (on/off): `department.read`, `department.manage`, `department.import`.
  - Nav **Departments** (`order: 30`, `RiBuilding2Line`): Department List `/departments` (`department.read`), Import Departments `/departments/import` (`department.import`).
- Endpoints:
  - `GET /api/departments` (`department.read`) returns `{id, name, employeeCount}[]` by name.
  - `POST` and `PATCH /:id` (`department.manage`):
    - Names are trimmed.
    - A case-insensitive duplicate gives 409.
  - `DELETE /:id` (`department.manage`) gives 409 `{error: 'Department has employees'}` when it has employees, else 204.
  - `GET /export?format=` (`department.read`).
  - Import (`department.import`):
    - Routes: `GET /import/guide`, `GET /import/template`, `POST /import/preview`, `POST /import/commit`.
    - Single column `name`.
    - Commit is all-or-nothing and writes one `IMPORT` audit row.
  - Every mutation is audited as `DEPARTMENT`.
- Also export `departmentExists(db, id): Promise<boolean>` for `employee`.

- [ ] **Step 1: Failing tests:**
  - CRUD statuses.
  - **Review Focus 5:** a preview of `Sales, sales, "", 2001 rows` flags the duplicate, the blank and the cap. A commit with an error gives 400 and writes 0 rows. A clean commit writes N rows plus one audit row.
- [ ] **Step 2:** Write the schema and migration.
- [ ] **Step 3-5:** Run (FAIL), implement, run (PASS).
- [ ] **Step 6:** Commit `feat(department): department module api`.

---

### Task 8: Employee schema and contracts

**Files:**
- Create: `packages/db/prisma/schema/employee.prisma`, migration `<ts>_employee`; `core.prisma` `User.employee Employee?`; `department.prisma` `Department.employees Employee[]`
- Create: `packages/contracts/src/employee/{manifest.ts, schemas.ts, fields.ts}`; register

**Interfaces:**
- Models, ported from HR-MNG-V1 minus shift, deviceUserId, salaryStructure, sales, accounting and later-module back-relations:
  - `Employee`:
    - Identity: `id`, `userId` (unique), `employeeCode` (unique), `fullName`, `profilePicture?`.
    - Personal: `dateOfBirth? @db.Date`, `gender?`, `nationalId?`, `bloodGroup?`, `maritalStatus?`, `phone?`, `presentAddress?`, `permanentAddress?`, `emergencyContact?`.
    - Work: `designation`, `departmentId`, `reportingManagerId?`, `employmentType`, `employmentStatus = ACTIVE`, `joiningDate @db.Date`, `officeLocation?`.
    - Bank: `bankAccountNumber?`, `bankName?`, `bankRoutingNumber?`.
    - Exit: `lastWorkingDay? @db.Date`, `exitReason?`, `exitNote?`.
    - Plus `createdAt`, `updatedAt`, relations `documents` and `changeRequests`, and indexes on `reportingManagerId` and `departmentId`.
  - Enums `EmploymentType`, `EmploymentStatus`, `ExitReason`, `DocumentType`, `EmployeeChangeField { NATIONAL_ID }`, `EmployeeChangeStatus { PENDING APPROVED REJECTED CANCELLED }`, valued as in HR-MNG-V1.
  - `Document` and `EmployeeChangeRequest` as in HR-MNG-V1.
- Manifest `employee`, `deps: ['core', 'department']`. Permissions:
  - `employee.read`: scopes `['team','department','all']`, `managerDefault: true`.
  - `employee.update`: scopes `['department','all']`.
  - `employee.exit`: scopes `['department','all']`.
  - `employee.documents.manage`: scopes `['department','all']`.
  - `employee.id_request.decide`: scopes `['department','all']`.
  - On/off: `employee.create`, `employee.read.financial`, `employee.export`.
- `fields.ts` exports `SELF_EDITABLE_FIELDS`, `HR_EDITABLE_FIELDS`, `WORK_FIELDS`, `EMPLOYMENT_FIELDS`, `PERSONAL_FIELDS`, `MONEY_FIELDS`.
- Nav:
  - **My Space** (`order: 10`, `RiUserSmileLine`): My Profile `/me` (null), Directory `/me/directory` (null).
  - **Employees** (`order: 20`, `RiTeamLine`):
    - Add Employee `/employees/new` (`employee.create`).
    - Employee List `/employees` (`employee.read:department`).
    - My Team `/employees/team` (`employee.read:team`).
    - ID Change Requests `/employees/id-requests` (`employee.id_request.decide:department`).
- Events: `employee.joined`, `employee.bank_changed`, `employee.exited`, `employee.national_id_change_requested`. Payloads carry ids and dates only.
- Schemas:
  - `createEmployeeSchema`: email, fullName, designation, departmentId, reportingManagerId?, employmentType, joiningDate `YYYY-MM-DD`, employeeCode?, roleId?.
  - `updateEmployeeSchema`.
  - `employeeViewSchema`: `{id, work, employment?, personal?, money?, editableFields}`.
  - `exitSchema`, `idChangeRequestSchema`.
- Starter roles:
  - HR Admin: every scoped employee permission at `all`, plus `employee.create`, `employee.export`, `employee.read.financial`.
  - Finance Officer: `employee.read.financial`, `employee.export`.

- [ ] **Step 1:** Write the schema and migration, then run `db:generate` and `db:test:prepare`.
- [ ] **Step 2:** Write the manifest and schemas. The registry test checks that employee orders after core and department.
- [ ] **Step 3:** Run the contracts and db tests. Expected: PASS.
- [ ] **Step 4:** Commit `feat(employee): employee schema and contracts`.

---

### Task 9: Employee api - create, list, read, update, access tiers

**Files:**
- Create: `apps/api/src/modules/employee/{employee.routes.ts, employee.controller.ts, employee.access.ts, employee.service.ts}`; mount `/employees`
- Test: `apps/api/src/modules/employee/{employee.access.test.ts, employee.routes.test.ts}`

**Interfaces:**
- Consumes `departmentExists`, `writeAudit`, `diffFields`, `emit`, `hashPassword`, `generateTemporaryPassword`, and `assertMayGrant` (core `guards.ts`).
- Produces:
  - `visibilityTier(viewer: AccessContext & {sub}, viewerEmployee: {id, departmentId} | null, subject: {userId, departmentId, reportingManagerId}): Tier`.
  - `projectEmployee(e, tier): EmployeeView`, which omits sections.
  - `writableFieldsFor(viewer, viewerEmployee, subject): ReadonlySet<string>`.
  - `employeeIdForUser(db, userId)`.
  - `scopeWhere(viewer, viewerEmployee, key): Prisma.EmployeeWhereInput`, the reusable record filter for a scope. Later modules copy this pattern for their own tables.
- Endpoints:
  - `POST /api/employees` (`employee.create`):
    - Creates User (`STANDARD`, optional `roleId` checked by `assertMayGrant`) and Employee in one transaction.
    - The employee code is generated `EMP-0001` style when omitted; a duplicate gives 409.
    - Returns 201 `{employee, temporaryPassword}`, emits `employee.joined` and audits.
  - `GET /api/employees` (`employee.read:department` or `employee.read.financial`): records within the viewer's scope (Finance sees all, at the `FINANCE` tier), with `?q=&departmentId=&status=` filters.
  - `GET /api/employees/me` returns the `SELF` view, or 404 when the user has no employee record.
  - `GET /api/employees/directory` (signed in): active employees at the `COLLEAGUE` tier, filtered by `?q=&departmentId=`.
  - `GET /api/employees/:id` returns the viewer's tier.
  - `PATCH /api/employees/:id`:
    - Every key must be writable, else 403 `{error: 'Field not editable: <name>'}`.
    - `assertNoReportingCycle` gives 409 `{error: 'Reporting line would form a cycle'}`.
    - A bank change emits `employee.bank_changed`.
    - Audits only the changed fields.

- [ ] **Step 1: Failing tests:**
  - Tier matrix (unit):
    - A department-scoped HR user is `FULL` for their own department and `COLLEAGUE` elsewhere.
    - **Review Focus 3:** the `COLLEAGUE` view has no hidden keys.
  - Create: 201; duplicate email gives 409; an unknown department gives 400.
  - Self-PATCH: `bankAccountNumber`, `designation` or `nationalId` gives 403 naming the field; `phone` gives 200.
  - **Review Focus 5 (cycle):** A->B->C, then setting C's manager to A gives 409, and setting A's manager to A gives 409.
  - FINANCE sees `money` but not `personal`.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(employee): create, read, update with scoped access`.

---

### Task 10: Employee api - manager grants, change requests, exit, account, export

**Files:**
- Create: `apps/api/src/modules/employee/{employee.team.ts, employee.changerequest.ts, employee.exit.ts, employee.export.ts}`
- Modify: `apps/api/src/app.ts` (register the grant provider), `employee.routes.ts`
- Test: `apps/api/src/modules/employee/{employee.team.test.ts, employee.changerequest.test.ts, employee.exit.test.ts}`

**Interfaces:**
- `managerGrantProvider: GrantProvider`:
  - Applies when the user's employee has at least one direct report with status `ACTIVE` or `ON_LEAVE`.
  - Returns `'<key>:team'` for every permission in the registry with `managerDefault: true`, so later modules only mark their permissions.
  - Returns `[]` otherwise.
- `GET /api/employees/team` (`employee.read:team`) lists direct reports at the `MANAGER` tier.
- National ID requests (port `employee.changerequest.ts`):
  - `POST /api/employees/national-id-requests` (self). One pending request per employee; a second gives 409. Emits the event.
  - `PATCH .../:id/cancel`: the owner, while pending.
  - `GET /api/employees/national-id-requests?status=`: scoped by `employee.id_request.decide`.
  - `PATCH .../:id/decide {approve, note?}`:
    - The decider's scope must reach the employee.
    - Self-decide gives 403.
    - Approve writes `nationalId` and audits.
- `PATCH /api/employees/:id/exit` (`employee.exit` reaching the subject):
  - Body `{lastWorkingDay, exitReason, exitNote?}`.
  - Status mapping as in HR-MNG-V1.
  - The user is deactivated immediately when `lastWorkingDay <= today`. The worker takes over in Plan 7.
  - Emits `employee.exited`.
- `PATCH /api/employees/:id/account {isActive}` (`employee.update` reaching the subject) goes through core's user-status service, so the super admin and admin guards apply.
- `GET /api/employees/export?format=` (`employee.export`): records within the viewer's read scope, with only the columns their tier may see.

- [ ] **Step 1: Failing tests:**
  - **Review Focus 4:** manager M with one report has `employee.read:team` after refresh. Move the report, refresh, and M lacks it; `/employees/team` returns 403.
  - Change requests:
    - The lifecycle works end to end.
    - A second pending request gives 409.
    - Self-decide gives 403.
  - Exit sets status, emits the event and deactivates when the date has passed.
  - The FINANCE export has no personal columns.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(employee): manager grants, id change requests, exit, export`.

---

### Task 11: Employee api - documents and avatar

**Files:**
- Create: `apps/api/src/modules/employee/employee.media.ts`; routes
- Test: `apps/api/src/modules/employee/employee.media.test.ts` (`setStorageForTests(memoryStorage())`)

**Interfaces (port `employee.media.ts`):**
- Documents:
  - `GET /api/employees/:id/documents`: SELF, or `employee.read` / `employee.documents.manage` reaching the subject at `department` or wider.
  - `POST /api/employees/:id/documents` (`employee.documents.manage` reaching the subject):
    - Multipart fields `file` and `type`.
    - pdf/jpeg/png up to 10 MB.
  - `GET .../documents/:docId/url` returns `{url}`, valid for 300 s.
  - `DELETE .../documents/:docId` removes the file, then the row, and audits.
- Avatar:
  - `PATCH` / `DELETE /api/employees/:id/avatar`: SELF, or `employee.update` reaching the subject.
  - jpeg/png/webp up to 2 MB.
  - Stored as `publicId:version`.
  - `avatarUrl` is null when storage is unconfigured.

- [ ] **Step 1: Failing tests:**
  - The document lifecycle works.
  - A colleague listing documents gets 403.
  - A wrong type gets 415.
  - With storage unset, upload gets 503 and `avatarUrl` is null.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(employee): documents and avatar`.

---

### Task 12: Web - departments and shared components

**Files:**
- Create: `packages/ui/src/components/{data-table.tsx, import-wizard.tsx, export-menu.tsx}` (shared by later modules)
- Create: `apps/web/modules/department/{api.ts, hooks.ts, components/{department-table.tsx, department-form-dialog.tsx}}`, `apps/web/app/(app)/departments/page.tsx`, `apps/web/app/(app)/departments/import/page.tsx`
- Test: `packages/ui/src/components/import-wizard.test.tsx` (vitest + @testing-library/react, jsdom)

**Interfaces:**
- `ImportWizard` props: `{ guideUrl, templateUrl, preview(file): Promise<ImportPreview>, commit(file): Promise<{count}>, onDone() }`.

- [ ] **Step 1: Failing test:** "Import" is disabled while the preview has issues and enabled when the preview is clean.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(web): departments pages and shared table, import and export components`.

---

### Task 13: Web - employees, team, ID requests

**Files:**
- Create: `apps/web/modules/employee/{api.ts, hooks.ts, components/{employee-table.tsx, employee-form.tsx, employee-profile.tsx, documents-panel.tsx, exit-dialog.tsx, id-request-table.tsx, avatar.tsx}}`
- Pages: `employees/page.tsx`, `employees/new/page.tsx`, `employees/[id]/page.tsx`, `employees/team/page.tsx`, `employees/id-requests/page.tsx`
- Test: `apps/web/modules/employee/components/employee-profile.test.tsx`

**Interfaces:**
- `EmployeeProfile` props: `{ employee: EmployeeView, onSave(patch), canExit, canManageDocuments }`.
  - It renders only the sections present, with edit controls only for `editableFields`.
  - It is reused by `/me`.
- `employees/new` shows a one-time temporary password dialog that can't be dismissed.
- `Avatar` falls back to initials.

- [ ] **Step 1: Failing test:**
  - A `COLLEAGUE` view renders no Personal or Bank sections.
  - `editableFields: ['phone']` renders exactly one input.
- [ ] **Step 2-4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5:** Commit `feat(web): employee pages`.

---

### Task 14: Web - My Profile and Directory; browser check; docs

**Files:**
- Pages:
  - `apps/web/app/(app)/me/page.tsx`: SELF profile, national-ID request card, avatar upload.
  - `apps/web/app/(app)/me/directory/page.tsx`.
- Modify: `CLAUDE.md` (access model, grant providers, test DB, shared kits, admin CLI), `docs/superpowers/plans/2026-10-27-erp-plan-1-followups.md` (mark resolved items)
- Create: `docs/superpowers/plans/2026-10-27-erp-plan-2-followups.md`

- [ ] **Step 1:** Implement. A user with no employee record (for example the super admin) sees "No employee profile is linked to this account" on `/me`.
- [ ] **Step 2:** Run `pnpm build && pnpm lint && pnpm typecheck && pnpm test` from root. Expected: green.
- [ ] **Step 3 (controller browser check):**
  - As the super admin, make user X an admin. X can open everything but has no admin actions on the super admin's row.
  - Create department "Engineering", employees A (manager) and B (reporting to A), and a "Branch HR" role with `employee.read` and `employee.update` at `department`.
  - As B: My Profile shows personal fields; B can edit phone but not bank fields; Directory lists A.
  - As A: the sidebar shows My Team, listing B without personal fields.
  - Sidebar order: Dashboard, My Space, Employees, Departments, Settings.
  - Take screenshots.
- [ ] **Step 4:** Commits `feat(web): my profile and directory` and `docs: plan 2 notes`.
- [ ] **Step 5:** Push to both remotes and open a PR into `dev` with a `Deploy impact` section:
  - Migrations `access_model` (maps existing users), `department` and `employee`.
  - New optional env `CLOUDINARY_*`, and `DATABASE_URL_TEST` for dev.
  - Run `db:seed`.
  - New CLI commands `admin:transfer` and `admin:reset-password`.
