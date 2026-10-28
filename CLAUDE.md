# ERP: working notes for agents

Turborepo + pnpm monorepo for a modular ERP. The design spec is `docs/superpowers/specs/2026-10-27-erp-monorepo-design.md` (§4 layout, §4.2 rules, §6 permissions, §7 events). Read it before adding a module.

## Git workflow

Full guide: [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md). In short:

- **`main`** = deployable only (release PRs from `dev`, hotfixes). **`dev`** = integration branch. Never commit directly to either.
- Work branch per task from `dev`: `<type>/<task-id>-<slug>`. Types: `feat fix refactor test docs chore hotfix`.
- Commits: Conventional Commits `type(scope): subject`, imperative, at most 72 characters, plain ASCII punctuation only.
- PR into `dev` on `origin`, human review, **squash merge**, delete the branch on both remotes. Releases: PR `dev` -> `main`, merge commit, tag `vX.Y.Z`. Every PR states its deploy impact (`Deploy impact: none` when there is none).
- **No AI attribution in commits or PRs** (no `Co-Authored-By: Claude`, no "Generated with Claude Code", no session link). `.claude/settings.json` sets `attribution` to empty; do not override it.

## Git: always push to both remotes

| Remote   | URL                                         | Role   |
| -------- | ------------------------------------------- | ------ |
| `origin` | https://github.com/byteSpate/HR-PAYROLL.git | Main   |
| `reza`   | https://github.com/rezaulrht/HRMS-ERP.git   | Backup |

```bash
git push origin <branch> && git push reza <branch>
```

- Never force-push `main` or `dev`. If a remote rejects a push, fetch and investigate instead.
- Fresh clone: `git remote add reza https://github.com/rezaulrht/HRMS-ERP.git`.

## Layout

- `apps/api`: Express 5 API. `src/app.ts` builds the app; `src/modules/<module>/` holds a module's routes, controllers and services; `src/modules/index.ts` exports `apiMounts`; `src/middleware/` is shared.
- `apps/web`: Next.js 16 App Router. `app/(auth)` is login, `app/(app)` is the signed-in shell; `modules/<module>/` holds a module's components, hooks and API client.
- `packages/contracts`: module manifests in `src/<module>/`, the registry in `src/registry.ts`, Zod schemas.
- `packages/db`: Prisma multi-file schema in `prisma/schema/*.prisma`, seed in `prisma/seed.ts` and `src/seed/`. The generated client goes to `src/generated` and is git-ignored.
- `packages/events`: `emit(tx, type, payload)` writes outbox rows.
- `packages/auth`, `packages/ui`, `packages/utils`, `packages/audit`, `packages/export`, `packages/attachments`, `packages/config-typescript`, `packages/config-eslint`: shared code.
- `apps/worker` (outbox delivery, cron jobs) is planned and not yet present.

## Root commands

- `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`: run through Turborepo.
- `pnpm format`: Prettier over the repo.
- `pnpm services:up` / `pnpm services:down`: start or stop the dev Postgres (Docker).
- `pnpm db:generate`, `pnpm db:deploy`, `pnpm db:seed`: Prisma client, migrations, seed.
- `pnpm db:test:prepare`: create, migrate and seed the separate `erp_test` database. Tests only ever use `DATABASE_URL_TEST` and run one file at a time (`pnpm test` runs packages serially) because they share it.
- One package: `pnpm --filter @erp/<pkg> <script>`.

## Local database and env

- Postgres 17 runs in Docker from `docker/compose.dev.yaml` on host port **5433**. Port 5432 is often used by another local Postgres, so every URL uses 5433.
- Env files are copied from their `.env.example` and git-ignored: `packages/db/.env` (`DATABASE_URL`, `DATABASE_URL_TEST`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`), `apps/api/.env`, `apps/web/.env.local`.
- Optional Cloudinary file storage: set all of `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` in `apps/api/.env` or none (uploads then answer 503 and avatars show initials).
- Only `.env.example` files are committed. Never commit real secrets.

## Migrations

Never run `prisma migrate dev`. It is interactive and fails in agent shells. Use this recipe from `packages/db`:

1. Confirm `pnpm exec prisma migrate status` shows no drift.
2. Edit the schema in `prisma/schema/`.
3. `mkdir -p prisma/migrations/<timestamp>_<name>`, then `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --script --output prisma/migrations/<timestamp>_<name>/migration.sql`
4. Read the generated SQL. Keep the `one_super_admin` partial unique index: `migrate diff` will propose dropping it, so delete that line from the generated SQL.
5. `pnpm db:deploy`, then `pnpm db:generate`.

## Deployment assumption

The API must be served from the same host as the web app (or proxied under a path of it). The refresh cookie is host-only and `SameSite=Lax`, so a cross-domain API would not receive it. Cross-domain support is a later change.

## Module rules

- Each business module has a manifest `packages/contracts/src/<module>/` that calls `defineModule({ name, deps, permissions, nav, events })`. Register it in `packages/contracts/src/registry.ts`. `core` is the reference.
- `deps` lists every module this one may import. The `erp/module-deps` ESLint rule (in both app configs, fed from the registry) errors on any import of an undeclared module.
- The `folders` option maps folder names to modules. Core covers `apps/api/src/modules/{auth,users}` and `apps/web/modules/settings`. Add a `folders` entry when a folder name differs from its module name.
- The dependency graph must stay acyclic. `resolveModuleOrder` throws at API boot on a cycle or an unknown dependency.
- Reads of another module's tables through the shared Prisma client are fine. Writes to another module's data go through its service functions, which accept an optional transaction client so callers can stay atomic.
- Loose coupling goes through events: `emit(tx, type, payload)` inside the caller's transaction, with event types listed in the manifest's `events`. Nothing delivers them yet.
- A capability needed by two or more modules goes into a shared package, not a copy. Shared kits: `@erp/audit` (`writeAudit`, `diffFields`, `listAudit`), `@erp/export` (xlsx/csv export with an audit row, and the all-or-nothing import kit), `@erp/attachments` (storage, signed URLs, `uploadSingle`), and in `@erp/ui` `DataTable`, `ImportWizard`, `ExportMenu`. `@erp/approvals` owns decision guards and stamps; `@erp/notifications` owns scoped in-app notifications and approver lookup.
- Permissions are declared as `{ label, scopes?, managerDefault? }` (no `scopes` means on/off). Access is `can(ctx, 'key' | 'key:scope')` from `@erp/auth`; a user is `SUPER_ADMIN` (one, DB-enforced; moved only by `pnpm admin:transfer <email>`, password reset by `pnpm admin:reset-password`), `ADMIN` (holds everything) or `STANDARD` (one role).
- Permission keys are `area.action` strings declared in each manifest. Keys must be unique across modules (`allPermissions` throws on duplicates). The API guards routes with `requirePermission('<key>')`.
- Code is the source of truth for permissions: `db:seed` deletes permission rows that no manifest declares, and grants newly declared ones to the starter roles that list them (admin edits to older grants are kept).
- `team` scope is never stored: a grant provider (`apps/api/src/modules/auth/derived-grants.ts`, registered in `createApp`) adds `'<key>:team'` for every `managerDefault` permission to users with active direct reports. Mark a permission `managerDefault: true` to give managers team access to it.
- Record filters follow the scope: `scopeFor(ctx, key)` returns the widest held scope; see `scopeWhere` and `reaches` in `apps/api/src/modules/employee` for the pattern (own record, direct reports, same department, everyone).
- Mutations that change who can do what re-read the caller from the database (`loadActor` in `apps/api/src/modules/users/actor.ts`) instead of trusting the token.
- `requirePermission` and `RequirePermission` accept a list meaning any-of.

## Add-a-module checklist

1. Manifest: `packages/contracts/src/<module>/` (`manifest.ts`, plus `schemas.ts` as needed). Register it in `registry.ts`.
2. Schema: `packages/db/prisma/schema/<module>.prisma`, then the migration recipe above.
3. API: `apps/api/src/modules/<module>/` (routes, controller, service). Mount the router in `apiMounts` in `apps/api/src/modules/index.ts`.
4. Web: `apps/web/modules/<module>/` for components, hooks and API client. Pages go in `apps/web/app/(app)/<route>/`, kept thin.
5. Grants: add starter grants to `packages/db/src/seed/starter-roles.ts`; the next `db:seed` grants them on existing databases too. SUPER_ADMIN and ADMIN users hold every permission implicitly.
6. Icons: add each new Remix icon name used in the manifest to `packages/ui/src/nav/icons.ts`.

## Conventions

- Package scope is `@erp/*`. Workspace dependencies use `workspace:*`.
- Exact versions only in `package.json` (no `^` or `~`). `.npmrc` and `pnpm-workspace.yaml` set `save-prefix` to empty. TypeScript is 6.0.3 across the repo.
- Node 24 (`>=24.9.0 <25`), pnpm 12.5.1.
- Short single-purpose files. No mock data, no dead or commented-out code. Comments explain why, not what.
- Do not import another module's internals; use the module's exported functions or its declared events.

## Attendance and leave

- Attendance and leave use office-local calendar dates (Asia/Dhaka) stored as UTC-midnight `@db.Date` values. Punches are instants; use attendance time helpers to convert them.
- Manifest navigation groups with the same label merge in `apps/web/lib/nav.ts`. Attendance exposes a leave-day lookup injection so it never imports the leave module.
- A non-admin cannot decide their own attendance or leave, even with an all-scope approval grant. `ADMIN` and `SUPER_ADMIN` may self-decide; decisions are audited and written to the outbox.
- Leave requests store charged days at submission. Approval updates the balance in the same transaction, and employee-specific advisory locks serialize applications, decisions, cancellations, and balance adjustments.
- In-app notification rows are transactionally written; email delivery and scheduling the callable attendance auto-close rule are deferred to the worker plan.
