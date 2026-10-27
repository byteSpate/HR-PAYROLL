# ERP Plan 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working pnpm + Turborepo monorepo where a user signs in, gets permissions from one or more roles, and sees the app shell with a module-driven, permission-filtered collapsible sidebar; plus the shared packages every later module plugs into.

**Architecture:** Split by layer (spec §4): `apps/api` (Express), `apps/web` (Next.js), shared `packages/*`. Modules declare a manifest (name, deps, permissions, nav, events) in `@erp/contracts`; the api mounts module routers, the web shell renders module nav groups. Permissions come from roles stored in the DB and are carried in the access token.

**Tech Stack:** Node 24, pnpm 12, Turborepo, TypeScript 7.0.2, Express 5.2.1, Prisma 7.9.0 + `@prisma/adapter-pg`, PostgreSQL 17 (Docker), Zod 4.4.3, jsonwebtoken 9.0.3, bcrypt 6.0.0, Next.js 16.2.12, React 19.2.4, TanStack Query 5.101.4, Tailwind 4.3.3, shadcn (`base-nova` style), `@remixicon/react`, vitest 4.1.10, supertest 7.2.2.

**Spec:** `docs/superpowers/specs/2026-10-27-erp-monorepo-design.md`

## Plan series

The spec is too large for one plan. Each plan ends in working, tested software:

1. **Foundation** (this plan): monorepo, contracts/module manifest, db core schema, auth + roles/permissions, events outbox write side, api shell, web shell + sidebar, users & roles admin.
2. Employee + department, shared kits `attachments`, `audit`, `export`; derived manager permissions; `/me` profile.
3. Attendance + leave, shared kit `approvals`, `notifications`.
4. Expense + asset (ledger actions → events).
5. Payroll + settlement (cross-module transactions, payslip PDF/email).
6. Announcement, event calendar, dashboard widgets.
7. `apps/worker` (cron jobs + outbox delivery), Swagger, Docker images for all apps, production compose.

Each later plan is written after the previous one lands, against the code that actually exists.

## Global Constraints

- Exact versions in every `package.json` (no `^`/`~`); `.npmrc` / `pnpm-workspace.yaml` set `savePrefix: ''`. Versions as listed in Tech Stack, copied from `HR-MNG-V1`'s installed packages.
- Package scope `@erp/*`. Root package name `erp`.
- `engines.node`: `">=24.9.0 <25"`; `packageManager`: `pnpm@12.5.1`.
- Only `.env.example` files are committed; real `.env` files are git-ignored.
- `prisma migrate dev` is never run (interactive). Migrations: `prisma migrate diff --from-config-datasource --to-schema <schema dir> --script --output <dir>/migration.sql`, read the SQL, then `prisma migrate deploy` (after `prisma migrate status` shows no drift).
- No sales, accounting, or Sales Hub code, columns, or flags.
- Colours, fonts, radius: copy `HR-MNG-V1/client/app/globals.css` tokens and the fonts in `HR-MNG-V1/client/app/layout.tsx` (Inter sans, Geist heading, Geist Mono, Noto Sans Bengali) verbatim.
- Short, single-purpose files; no mock data; comment density like `HR-MNG-V1` clean files (explain *why*, not *what*).
- A module may import only modules listed in its manifest `deps`; module graph acyclic.

## Review Focus

1. **Stale permissions after a role edit** — a user whose role loses `role.manage` must lose access by the next token refresh (≤ access-token lifetime), not keep it until they log out. Test in Task 8: refresh after role change returns the new permission set.
2. **Last super admin locks themselves out** — removing `SUPER_ADMIN` from the only active user holding it, or deactivating them, must be refused with 409. Test in Task 9.
3. **Deactivated user with a live refresh cookie** — refresh must fail with 401 and revoke the session. Test in Task 8.
4. **Nav group with some forbidden items** — the group shows only permitted items; a group with zero permitted items is hidden entirely; the active group is expanded on deep links (`/settings/roles/abc`). Tests in Task 10.
5. **Module manifest with an undeclared or circular dependency** — must fail at startup/test time with a message naming the modules, not silently mount. Test in Task 2.

---

## File structure

```
ERP/
├─ package.json  pnpm-workspace.yaml  turbo.json  .npmrc  .gitignore  .prettierrc
├─ CLAUDE.md  README.md                      (Task 12)
├─ docker/compose.dev.yaml                   postgres 17 for dev/test
├─ packages/
│  ├─ config-typescript/{base,library,node-app,nextjs}.json
│  ├─ config-eslint/{index.js, rules/module-deps.js}
│  ├─ utils/src/{app-error.ts, index.ts}
│  ├─ contracts/src/
│  │  ├─ module.ts                           ModuleManifest, defineModule, NavGroup, NavItem
│  │  ├─ registry.ts                         modules[], resolveModuleOrder(), allPermissions()
│  │  ├─ core/{module.ts, permissions.ts, schemas.ts, nav.ts}
│  │  └─ index.ts
│  ├─ db/
│  │  ├─ prisma.config.ts
│  │  ├─ prisma/schema/{base.prisma, core.prisma}
│  │  ├─ prisma/migrations/
│  │  ├─ prisma/seed.ts
│  │  └─ src/{client.ts, index.ts, seed/{sync-permissions.ts, system-roles.ts}}
│  ├─ auth/src/{tokens.ts, passwords.ts, permissions.ts, index.ts}
│  ├─ events/src/{emit.ts, index.ts}
│  └─ ui/src/
│     ├─ styles/globals.css                  tokens copied from HR-MNG-V1
│     ├─ lib/cn.ts
│     ├─ components/*.tsx                    shadcn components
│     └─ nav/{filter-nav.ts, icons.ts, app-sidebar.tsx}
├─ apps/
│  ├─ api/src/
│  │  ├─ index.ts  app.ts  env.ts
│  │  ├─ middleware/{error-handler.ts, require-auth.ts, require-permission.ts}
│  │  └─ modules/
│  │     ├─ index.ts                         apiMounts: [prefix, router][]
│  │     ├─ auth/{auth.routes.ts, auth.controller.ts, auth.service.ts, auth.cookies.ts, auth.sessions.ts}
│  │     └─ users/{users.routes.ts, users.service.ts, roles.routes.ts, roles.service.ts, last-admin.ts}
│  └─ web/
│     ├─ app/layout.tsx  app/globals.css  app/page.tsx
│     ├─ app/(auth)/login/page.tsx
│     ├─ app/(app)/layout.tsx  app/(app)/dashboard/page.tsx
│     ├─ app/(app)/settings/{users,roles,roles/new,roles/[id]}/page.tsx
│     ├─ proxy.ts
│     ├─ lib/{api-client.ts, session.tsx, query-provider.tsx, nav.ts}
│     └─ modules/settings/{api.ts, hooks.ts, components/*.tsx}
```

---

### Task 1: Monorepo skeleton

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.gitignore`, `.prettierrc`
- Create: `packages/config-typescript/{package.json, base.json, library.json, node-app.json, nextjs.json}`
- Create: `packages/config-eslint/{package.json, index.js}`

**Interfaces:**
- Produces: root scripts `dev | build | lint | typecheck | test | format | db:generate | db:deploy | db:seed | services:up | services:down`, each `turbo run <task>` or `pnpm --filter @erp/db <task>`. Config packages `@erp/config-typescript`, `@erp/config-eslint`.

- [ ] **Step 1:** Write root `package.json` modelled on `byteSpate/HMS/package.json` (name `erp`, `type: module`, `packageManager: pnpm@12.5.1`, engines from Global Constraints), devDependencies `turbo 2.11.7`, `typescript 7.0.2`, `vitest 4.1.10`, `eslint 9.39.5`, `typescript-eslint` + `prettier` at the versions in HMS root. `services:up` = `docker compose -f docker/compose.dev.yaml up -d --wait`.
- [ ] **Step 2:** `pnpm-workspace.yaml`: `packages: [apps/*, packages/*]`, `savePrefix: ''`, `allowBuilds` with `'@prisma/engines': true`, `prisma: true`, `bcrypt: true`, `'@parcel/watcher': false`. `turbo.json`: copy HMS's, with test `passThroughEnv: [DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET]`.
- [ ] **Step 3:** `config-typescript/base.json`: strict, `target ES2022`, `skipLibCheck`, `noUncheckedIndexedAccess`. `library.json` / `node-app.json`: `module NodeNext`, `moduleResolution NodeNext`. `nextjs.json`: `moduleResolution bundler`, `jsx preserve`, `plugins: [{name: "next"}]`.
- [ ] **Step 4:** `config-eslint/index.js`: exports a flat config array (typescript-eslint recommended). The module boundary rule is added in Task 2.
- [ ] **Step 5:** `.gitignore`: `node_modules`, `dist`, `.next`, `.turbo`, `coverage`, `.env`, `.env.*`, `!.env.example`, `packages/db/src/generated`.
- [ ] **Step 6:** Run `pnpm install && pnpm typecheck`. Expected: install succeeds; typecheck exits 0 (no tasks yet).
- [ ] **Step 7:** Commit `chore: monorepo skeleton`.

---

### Task 2: `@erp/utils` and `@erp/contracts` module manifest + registry

**Files:**
- Create: `packages/utils/{package.json, tsconfig.json, src/app-error.ts, src/index.ts}`
- Create: `packages/contracts/{package.json, tsconfig.json, src/module.ts, src/registry.ts, src/core/*.ts, src/index.ts}`
- Create: `packages/config-eslint/rules/module-deps.js`
- Test: `packages/contracts/src/registry.test.ts`, `packages/config-eslint/rules/module-deps.test.js`

**Interfaces:**
- Produces (`@erp/utils`): `class AppError extends Error { constructor(status: number, message: string, code?: string) }`.
- Produces (`@erp/contracts`):
  ```ts
  type Permission = `${string}.${string}`
  interface NavItem { label: string; href: string; icon: string; permission: Permission | null }
  interface NavGroup { label: string; icon: string; items: NavItem[] }
  interface ModuleManifest {
    name: string; deps: readonly string[]
    permissions: Record<Permission, string>   // key → human label
    nav: NavGroup[]; events: readonly string[]
  }
  function defineModule<M extends ModuleManifest>(m: M): M
  const modules: readonly ModuleManifest[]                                       // registry.ts, core first
  function resolveModuleOrder(ms: readonly ModuleManifest[]): ModuleManifest[]   // topological; throws
  function allPermissions(ms?: readonly ModuleManifest[]): { key: Permission; label: string; module: string }[]
  ```
  `icon` is a Remix icon component name string (e.g. `"RiSettings3Line"`) so contracts stay React-free; `@erp/ui` maps it.
- Produces `@erp/contracts/core`: manifest `core` with permissions `user.manage`, `role.manage`, `settings.manage`, `audit.read`; nav groups **Dashboard** → Overview `/dashboard` (`null`) and **Settings** → Users `/settings/users` (`user.manage`), Roles & Permissions `/settings/roles` (`role.manage`). Zod schemas: `loginSchema {email, password}`, `createUserSchema {email, displayName, roleIds: string[] min 1}`, `updateUserRolesSchema {roleIds}`, `updateUserStatusSchema {isActive}`, `roleSchema {name, description?, permissions: string[]}`, `changePasswordSchema {currentPassword, newPassword min 8}`, `publicUserSchema {id, email, displayName, isActive, mustChangePassword, roles: {id,name}[], permissions: string[]}` with `type PublicUser`.
- Package `exports`: `"."` and `"./core"`. Built with `tsc` to `dist`.

- [ ] **Step 1: Failing tests** in `registry.test.ts` (**Review Focus 5**):
  - `resolveModuleOrder([b(deps:['a']), a(deps:[])])` → names `['a','b']`.
  - unregistered dep → throws, message contains `unknown dependency 'x'` and the dependant's name.
  - `a↔b` → throws, message contains `cycle` and `a -> b -> a`.
  - `allPermissions()` includes `{ key: 'role.manage', module: 'core' }`; the same key in two modules throws `duplicate permission 'p.x'`.
- [ ] **Step 2:** Run `pnpm --filter @erp/contracts test`. Expected: FAIL.
- [ ] **Step 3:** Implement `module.ts`, `registry.ts` (Kahn's algorithm; cycle path found by DFS for the message), `core/*`, `utils/app-error.ts`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: Failing test** `module-deps.test.js` (ESLint `RuleTester`): in a file under `apps/api/src/modules/b/`, importing `../a/a.service` when `b.deps` contains `a` passes; when it doesn't, fails with `module 'b' imports 'a' which is not in its deps`. Imports of shared packages and same-module files always pass. Same for `apps/web/modules/*`.
- [ ] **Step 6:** Implement rule `erp/module-deps` (reads the manifest list from built `@erp/contracts`, maps `modules/<name>/` path segments); register in `index.js`. Run `pnpm --filter @erp/config-eslint test`. Expected: PASS.
- [ ] **Step 7:** Commit `feat(contracts): module manifest, registry, boundary lint`.

---

### Task 3: `@erp/db` core schema, client, first migration

**Files:**
- Create: `docker/compose.dev.yaml` (service `postgres`, image `postgres:17`, port `5432`, db/user/password `erp`, healthcheck `pg_isready`, volume `erp-pg`)
- Create: `packages/db/{package.json, tsconfig.json, prisma.config.ts, .env.example}`
- Create: `packages/db/prisma/schema/{base.prisma, core.prisma}`
- Create: `packages/db/src/{client.ts, index.ts}`
- Test: `packages/db/src/client.test.ts`

**Interfaces:**
- Produces: `prisma` (singleton `PrismaClient` with `PrismaPg` adapter from `DATABASE_URL`), `type Tx = Prisma.TransactionClient`, `type Db = PrismaClient | Tx`; re-exports generated types. Generator output `src/generated/prisma`.
- `core.prisma` models (port shapes from `HR-MNG-V1/server/prisma/schema.prisma`, minus `role`, `salesRole`, `salesCommentsAuthored`, and the `employee` relation, which Plan 2 adds):
  - `User { id uuid, email unique, passwordHash, isActive=true, mustChangePassword=false, displayName?, avatarUrl?, createdAt, updatedAt, roles UserRole[], refreshTokens, passwordResetTokens }`
  - `Role { id uuid, name unique, description?, isSystem=false, permissions RolePermission[], users UserRole[], createdAt, updatedAt }`
  - `Permission { key @id, label, module }`
  - `RolePermission { roleId, permissionKey, @@id([roleId, permissionKey]) }` — cascade on role and permission delete
  - `UserRole { userId, roleId, @@id([userId, roleId]) }` — cascade on user delete, `Restrict` on role delete
  - `RefreshToken`, `PasswordResetToken`: copy from HR-MNG-V1 verbatim (sessionId, startedAt, lastUsedAt, userAgent, ipAddress, index)
  - `AuditLog`: copy from HR-MNG-V1, plus `@@index([entity, entityId])`
  - `OutboxEvent { id uuid, type, payload Json, createdAt, availableAt default now, deliveredAt?, attempts Int=0, lastError?, @@index([deliveredAt, availableAt]) }`

- [ ] **Step 1:** Add `compose.dev.yaml`; run `pnpm services:up`. Expected: postgres healthy.
- [ ] **Step 2:** `.env.example`: `DATABASE_URL=postgresql://erp:erp@localhost:5432/erp`; copy to `.env`.
- [ ] **Step 3:** Write schema files; run `pnpm db:generate`. Expected: client generated, no errors.
- [ ] **Step 4:** Create migration `prisma/migrations/<timestamp>_core/migration.sql` with the diff recipe, read the SQL, `prisma migrate deploy`. Expected: `All migrations have been successfully applied.`
- [ ] **Step 5: Failing test** `client.test.ts`: inside `prisma.$transaction`, create Role `t-<random>`, read it back, throw to roll back; afterwards the role does not exist.
- [ ] **Step 6:** Run `pnpm --filter @erp/db test` → FAIL; implement `client.ts`; → PASS.
- [ ] **Step 7:** Commit `feat(db): core schema and client`.

---

### Task 4: `@erp/auth` tokens, passwords, permissions

**Files:**
- Create: `packages/auth/{package.json, tsconfig.json, src/tokens.ts, src/passwords.ts, src/permissions.ts, src/index.ts}`
- Test: `packages/auth/src/{tokens,permissions}.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface AccessTokenPayload { sub: string; permissions: string[] }
  function signAccessToken(p: AccessTokenPayload, secret: string, expiresIn: string): string
  function verifyAccessToken(token: string, secret: string): AccessTokenPayload   // throws on invalid/expired
  function generateOpaqueToken(): string             // 32 random bytes, base64url
  function hashToken(raw: string): string            // sha256 hex
  function refreshLifetimeMs(setting: string): number   // "7d" | "12h" | "30m"
  function hashPassword(plain: string): Promise<string>        // bcrypt cost 12
  function verifyPassword(plain: string, hash: string): Promise<boolean>
  function generateTemporaryPassword(): string
  function effectivePermissions(roles: { permissions: { permissionKey: string }[] }[]): string[]  // union, sorted, deduped
  function hasPermission(granted: readonly string[], required: string): boolean
  ```
  `"."` export is server-only (node crypto, bcrypt); `"./permissions"` export is browser-safe (`hasPermission`, `effectivePermissions`).

- [ ] **Step 1: Failing tests:** sign→verify round-trips `{sub:'u1', permissions:['a.b']}`; wrong secret throws; `refreshLifetimeMs('7d') === 604_800_000`, `('30m') === 1_800_000`, `('x')` throws; `effectivePermissions` of `['b.x','a.y']` and `['a.y']` → `['a.y','b.x']`; `hasPermission(['a.y'],'a.y')` true, `(['a.y'],'a.z')` false; `generateTemporaryPassword().length >= 12`.
- [ ] **Step 2:** Run `pnpm --filter @erp/auth test`. Expected: FAIL.
- [ ] **Step 3:** Implement (port `HR-MNG-V1/server/src/modules/auth/auth.utils.ts`; secrets passed in, not read from env).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(auth): tokens, passwords, permissions`.

---

### Task 5: `@erp/events` outbox write side

**Files:**
- Create: `packages/events/{package.json, tsconfig.json, src/emit.ts, src/index.ts}`
- Test: `packages/events/src/emit.test.ts`

**Interfaces:**
- Consumes: `Tx` from `@erp/db`.
- Produces: `function emit<T>(tx: Tx, type: string, payload: T): Promise<{ id: string }>` — writes one `OutboxEvent`. Takes a transaction client only; delivery is Plan 7.

- [ ] **Step 1: Failing test:** a `$transaction` that emits `test.happened` (payload carries a unique marker) then throws leaves no matching row; one that commits leaves exactly one with `deliveredAt === null`, `attempts === 0`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(events): transactional outbox emit`.

---

### Task 6: `apps/api` shell

**Files:**
- Create: `apps/api/{package.json, tsconfig.json, .env.example, src/index.ts, src/app.ts, src/env.ts}`
- Create: `apps/api/src/middleware/{error-handler.ts, require-auth.ts, require-permission.ts}`
- Create: `apps/api/src/modules/index.ts`
- Test: `apps/api/src/app.test.ts`, `apps/api/src/middleware/require-permission.test.ts`

**Interfaces:**
- Consumes: `AppError`, `verifyAccessToken`, `hasPermission`, `modules`, `resolveModuleOrder`.
- Produces:
  - `env` (Zod-parsed): `DATABASE_URL`, `PORT=4000`, `CLIENT_ORIGIN=http://localhost:3000`, `CORS_ORIGINS?`, `JWT_ACCESS_SECRET` (min 16), `JWT_REFRESH_SECRET` (min 16), `JWT_ACCESS_EXPIRY=15m`, `JWT_REFRESH_EXPIRY=7d`, `APP_TIMEZONE=Asia/Dhaka`, `COMPANY_NAME=Byte Spate`.
  - `createApp(): Express` — `trust proxy 1`, helmet, cors (credentials, origins from `CORS_ORIGINS` or `CLIENT_ORIGIN`), cookie-parser, json, morgan (`combined` in production, else `dev`), `GET /health → {status:'ok'}`, mounts `apiMounts` under `/api`, then `errorHandler`. Calls `resolveModuleOrder(modules)` first so a broken manifest stops boot.
  - `apiMounts: [prefix: string, router: Router][]` (filled by Tasks 8–9).
  - `requireAuth` reads `Authorization: Bearer`, sets `req.user: AccessTokenPayload` (augment `Express.Request`); else 401 `{error}`.
  - `requirePermission(p: string)` → 403 `{error: 'Forbidden', permission: p}` when missing.
  - `errorHandler`: `AppError` → its status `{error, code?}`; `ZodError` → 400 `{error: 'Invalid request body', issues}`; otherwise 500 `{error: 'Internal server error'}` and log.

- [ ] **Step 1: Failing tests:** `GET /health` → 200 `{status:'ok'}`; unknown route → 404; on a test router with `requirePermission('a.b')`: no token → 401, token without `a.b` → 403 `{error:'Forbidden', permission:'a.b'}`, with it → 200.
- [ ] **Step 2:** Run `pnpm --filter @erp/api test` → FAIL. **Step 3:** Implement. **Step 4:** → PASS.
- [ ] **Step 5:** `pnpm --filter @erp/api dev`, then `curl localhost:4000/health`. Expected `{"status":"ok"}`.
- [ ] **Step 6:** Commit `feat(api): app shell and auth middleware`.

---

### Task 7: Seed — permission sync, system roles, first super admin

**Files:**
- Create: `packages/db/prisma/seed.ts`, `packages/db/src/seed/{sync-permissions.ts, system-roles.ts}`
- Test: `packages/db/src/seed/sync-permissions.test.ts`

**Interfaces:**
- Consumes: `allPermissions()`, `hashPassword`.
- Produces:
  - `syncPermissions(db: Db, perms: {key,label,module}[]): Promise<{ added: string[]; removed: string[] }>` — upserts each; deletes rows no longer declared (cascading their grants).
  - `SYSTEM_ROLES: { name: string; description: string; permissions: string[] | 'ALL' }[]` — `SUPER_ADMIN` (`'ALL'`, re-granted every seed), `HR_ADMIN` (`user.manage`, `audit.read`), `FINANCE_OFFICER` (`[]`), `EMPLOYEE` (`[]`), all `isSystem: true`. Later plans add their module grants here.
  - `seed.ts`: sync permissions → create missing system roles (existing non-SUPER_ADMIN grants untouched so admin edits survive) → if `SEED_ADMIN_EMAIL` is set and no active user holds `SUPER_ADMIN`, create that user with `SEED_ADMIN_PASSWORD`, `mustChangePassword: true`, roles `SUPER_ADMIN` + `EMPLOYEE`. Idempotent; logs added/removed.
  - `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` in `packages/db/.env.example`.

- [ ] **Step 1: Failing test:** sync `[a.x, a.y]`, grant both to a test role, sync `[a.x]` → result `removed: ['a.y']` and the role now has only `a.x`.
- [ ] **Step 2–4:** Run → FAIL → implement → PASS.
- [ ] **Step 5:** Run `pnpm db:seed` twice. Expected: second run logs `added: [] removed: []` and creates no second admin.
- [ ] **Step 6:** Commit `feat(db): permission sync and system role seed`.

---

### Task 8: api `auth` module — login, refresh, logout, me, sessions, change password

**Files:**
- Create: `apps/api/src/modules/auth/{auth.routes.ts, auth.controller.ts, auth.service.ts, auth.cookies.ts, auth.sessions.ts}`
- Test: `apps/api/src/modules/auth/{auth.routes.test.ts, auth.service.test.ts}`
- Modify: `apps/api/src/modules/index.ts` (mount `/auth`)

**Interfaces:**
- Consumes: Task 4 functions, `prisma`, `env`, core schemas.
- Produces (port behaviour from `HR-MNG-V1/server/src/modules/auth`; **one login for everyone** — the old admin/staff split existed only because roles were exclusive):
  - `POST /api/auth/login` → 200 `{accessToken, user: PublicUser}` + `refreshToken` httpOnly cookie (options copied from HR-MNG-V1 `refreshCookieSetOptions`); 401 `{error:'Invalid email or password'}` for bad credentials or an inactive user.
  - `POST /api/auth/refresh` (cookie) → rotates the token (same `sessionId`, new row, old revoked), re-reads roles so permissions are current → 200 `{accessToken, user}`; 401 if missing/revoked/expired/user inactive, revoking that session.
  - `POST /api/auth/logout` → revokes the current token, clears the cookie, 200 `{success:true}`.
  - `GET /api/auth/me` (auth) → `PublicUser`.
  - `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:sessionId` → port `auth.sessions.ts`.
  - `POST /api/auth/change-password` → verifies current, sets new hash, clears `mustChangePassword`, revokes the user's other sessions.
  - `loadPublicUser(db: Db, userId: string): Promise<PublicUser>` (roles + `effectivePermissions`), exported for Task 9.
  - Password reset and email change wait for `@erp/notifications` (Plan 3).

- [ ] **Step 1: Failing tests** (supertest on `createApp()`, real DB, unique emails per test, cleaned up):
  - login ok → 200; `user.permissions` equals the role's; `Set-Cookie` has `refreshToken=` and `HttpOnly`.
  - wrong password → 401 `Invalid email or password`; inactive user with the right password → same 401.
  - refresh rotates: reusing the first cookie after a refresh → 401.
  - **Review Focus 1:** login, remove a permission from the user's role, refresh → `user.permissions` lacks it.
  - **Review Focus 3:** login, set `isActive=false`, refresh → 401 and the session's token row has `revokedAt` set.
  - logout then refresh → 401.
  - a user with two roles gets the union of their permissions.
  - change-password with a wrong current password → 400; correct → 200 and `mustChangePassword` false.
- [ ] **Step 2:** Run `pnpm --filter @erp/api test auth` → FAIL.
- [ ] **Step 3:** Implement service, controller, routes, cookies, sessions.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(api): auth module`.

---

### Task 9: api `users` + `roles` admin

**Files:**
- Create: `apps/api/src/modules/users/{users.routes.ts, users.service.ts, roles.routes.ts, roles.service.ts, last-admin.ts}`
- Test: `apps/api/src/modules/users/{users.routes.test.ts, roles.routes.test.ts}`
- Modify: `apps/api/src/modules/index.ts` (mount `/users`, `/roles`)

**Interfaces:**
- Consumes: `requireAuth`, `requirePermission`, `loadPublicUser`, `hashPassword`, `generateTemporaryPassword`, `allPermissions`, core schemas.
- Produces:
  - `GET /api/users` (`user.manage`) → `PublicUser[]`, `?q=` matches email/displayName, ordered by email.
  - `POST /api/users` (`user.manage`) → 201 `{user, temporaryPassword}`, `mustChangePassword: true`. (Email invite: Plan 3.)
  - `PATCH /api/users/:id/roles` (`user.manage`) → `PublicUser`. Granting or removing `SUPER_ADMIN` also requires the caller to hold `role.manage`.
  - `PATCH /api/users/:id/status` (`user.manage`) → `PublicUser`; deactivating revokes all their refresh tokens.
  - `GET /api/roles` (`role.manage`) → `{id, name, description, isSystem, permissions: string[], userCount}[]`.
  - `GET /api/roles/permissions` (`role.manage`) → `{module, permissions: {key, label}[]}[]`.
  - `POST /api/roles`, `PATCH /api/roles/:id` (`role.manage`) — unknown permission key → 400; editing `SUPER_ADMIN`'s permissions → 409.
  - `DELETE /api/roles/:id` (`role.manage`) → 409 if `isSystem` or `userCount > 0`, else 204.
  - `assertNotLastSuperAdmin(tx: Tx, change: { userId: string; removesSuperAdmin?: boolean; deactivates?: boolean }): Promise<void>` → throws `AppError(409, 'At least one active super admin is required')`.
  - Every mutation writes one `AuditLog` row (`entity: 'USER' | 'ROLE'`, changed fields only).

- [ ] **Step 1: Failing tests:**
  - without `user.manage` → 403 on every users route; without `role.manage` → 403 on every roles route.
  - create user → 201, `temporaryPassword.length >= 12`, and the new user can log in with it.
  - **Review Focus 2:** with one active super admin, removing their `SUPER_ADMIN` → 409 and deactivating them → 409; with two, removing one → 200.
  - delete system role → 409; custom role with a user → 409; without users → 204.
  - PATCH role with `permissions: ['nope.nope']` → 400.
  - each mutation writes exactly one `AuditLog` row.
- [ ] **Step 2–4:** Run → FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(api): users and roles admin`.

---

### Task 10: `@erp/ui` — tokens, components, permission-filtered sidebar

**Files:**
- Create: `packages/ui/{package.json, tsconfig.json, components.json, src/styles/globals.css, src/lib/cn.ts}`
- Create: `packages/ui/src/components/*.tsx` — via `pnpm dlx shadcn@4.15.0 add` with HR-MNG-V1's `components.json` settings (`base-nova`, `remixicon`, neutral, css variables): button, input, label, card, field, collapsible, sidebar, dropdown-menu, avatar, table, dialog, checkbox, sonner, skeleton, badge, password-input (copy from HR-MNG-V1)
- Create: `packages/ui/src/nav/{filter-nav.ts, icons.ts, app-sidebar.tsx}`
- Test: `packages/ui/src/nav/filter-nav.test.ts`

**Interfaces:**
- Consumes: `NavGroup` from `@erp/contracts`, `hasPermission` from `@erp/auth/permissions`.
- Produces:
  ```ts
  interface VisibleGroup extends NavGroup { active: boolean; activeHref: string | null }
  function filterNav(groups: NavGroup[], permissions: readonly string[], pathname: string): VisibleGroup[]
  function NavIcon(props: { name: string; className?: string }): JSX.Element   // Remix name → component; fallback RiCircleLine
  function AppSidebar(props: { groups: NavGroup[]; permissions: readonly string[] }): JSX.Element   // client; usePathname
  ```
  `filterNav`: keep items with `permission === null` or granted; drop empty groups; an item matches when `pathname === href` or starts with `href + '/'`; `activeHref` = the longest matching href in the group; `active` = `activeHref !== null`.
- Sidebar look (spec §8): shadcn `Sidebar` + one `Collapsible` per group; header = icon + label + chevron; items indented under a 1px vertical guide line (`border-l border-sidebar-border`), each with its own icon; the active group open by default; active item styled with `sidebar-accent`. Colours only from the copied tokens.
- `globals.css`: `HR-MNG-V1/client/app/globals.css` verbatim, plus `@source "../**/*.{ts,tsx}"`.

- [ ] **Step 1: Failing tests (Review Focus 4):**
  - items `[A(p1), B(p2)]`, permissions `[p1]` → only `A`.
  - all items forbidden → group absent.
  - `null`-permission item always visible.
  - pathname `/settings/roles/abc` → Settings `active: true`, `activeHref: '/settings/roles'`; `/settingsx` → not active.
- [ ] **Step 2–4:** `pnpm --filter @erp/ui test` → FAIL → implement → PASS.
- [ ] **Step 5:** Commit `feat(ui): tokens, components, module sidebar`.

---

### Task 11: `apps/web` — login, session, app shell, settings pages

**Files:**
- Create: `apps/web/{package.json, tsconfig.json, next.config.ts, postcss.config.mjs, .env.example, proxy.ts}`
- Create: `apps/web/app/{layout.tsx, globals.css, page.tsx}` (`page.tsx` redirects to `/dashboard`)
- Create: `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(app)/{layout.tsx, dashboard/page.tsx}`
- Create: `apps/web/app/(app)/settings/{users/page.tsx, roles/page.tsx, roles/new/page.tsx, roles/[id]/page.tsx}`
- Create: `apps/web/lib/{api-client.ts, session.tsx, query-provider.tsx, nav.ts}`
- Create: `apps/web/modules/settings/{api.ts, hooks.ts, components/{users-table.tsx, create-user-form.tsx, role-form.tsx, permission-picker.tsx, change-password-dialog.tsx}}`
- Test: `apps/web/lib/api-client.test.ts`, `apps/web/proxy.test.ts`

**Interfaces:**
- Consumes: endpoints from Tasks 8–9, `AppSidebar`, `modules`, `resolveModuleOrder`, core schemas.
- Produces:
  - `.env.example`: `NEXT_PUBLIC_API_URL=http://localhost:4000/api`. `next.config.ts`: `transpilePackages: ['@erp/ui', '@erp/contracts']`.
  - `createApiClient({ baseUrl, onUnauthenticated })` (port `HR-MNG-V1/client/lib/auth/token-refresh.ts`): access token in memory, `credentials: 'include'`, on 401 one single-flight refresh then one retry; refresh failure → `onUnauthenticated()`.
  - `SessionProvider` / `useSession(): { user: PublicUser | null; status: 'loading' | 'authenticated' | 'unauthenticated'; signIn(email, password): Promise<void>; signOut(): Promise<void> }` — bootstraps with `/auth/refresh` on mount.
  - `lib/nav.ts`: `navGroups = resolveModuleOrder(modules).flatMap(m => m.nav)`.
  - `(app)/layout.tsx`: unauthenticated → `/login?returnTo=…`; `mustChangePassword` → blocking `ChangePasswordDialog`; `AppSidebar` + top bar with user menu (name, sign out).
  - `proxy.ts`: guards everything except `/login`, `/_next/*`, static files; no `refreshToken` cookie → `/login?returnTo=<path>` (port `return-to.ts`: same-site paths only).
  - Pages: Users (table, search, create form showing the temporary password once, role multi-select, activate/deactivate), Roles list, New role, Edit role (name, description, permission checkboxes grouped by module).
  - Fonts and `<html>` classes copied from `HR-MNG-V1/client/app/layout.tsx`.

- [ ] **Step 1: Failing tests:** api-client — two concurrent 401s cause exactly one refresh, then each request retries once; refresh failure calls `onUnauthenticated`. proxy — `/settings/users` without cookie → redirect `/login?returnTo=%2Fsettings%2Fusers`; `/login` passes; `returnTo=https://evil.com` is dropped.
- [ ] **Step 2–4:** `pnpm --filter @erp/web test` → FAIL → implement → PASS.
- [ ] **Step 5:** `pnpm services:up && pnpm db:deploy && pnpm db:seed && pnpm dev`. In a browser: log in as the seeded admin → forced password change → dashboard; sidebar shows **Dashboard** and **Settings** (Users, Roles & Permissions) with the guide line. Create a role with only `user.manage`, a user with that role, log in as them in a private window → Settings shows only **Users**. Screenshot both sidebars.
- [ ] **Step 6:** From root: `pnpm build && pnpm lint && pnpm typecheck && pnpm test`. Expected: all green.
- [ ] **Step 7:** Commit `feat(web): login, session, app shell, settings`.

---

### Task 12: Repo docs

**Files:**
- Create: `CLAUDE.md`, `README.md`

- [ ] **Step 1:** `CLAUDE.md`: layout (spec §4), root commands, the migration recipe, module rules (manifest + `deps` + boundary lint; events for loose coupling; writes to a dependency go through its service functions), and the add-a-module checklist: contracts manifest → `registry.ts` → `packages/db/prisma/schema/<module>.prisma` → `apps/api/src/modules/<module>` + `apiMounts` → `apps/web/modules/<module>` + `app/(app)/<route>` → grants in `system-roles.ts`.
- [ ] **Step 2:** `README.md`: intro paragraph, prerequisites (Node 24, pnpm 12, Docker), first run (copy `.env.example`s, `services:up`, `db:deploy`, `db:seed`, `dev`).
- [ ] **Step 3:** Commit `docs: CLAUDE.md and README`.
