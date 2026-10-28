# Plan 1 follow-ups

Resolved in Plan 2: tests no longer touch the dev database or the seeded admin (isolated `erp_test`); newly declared permissions now reach existing starter roles on seed; the role-based last-admin model was replaced by one fixed super admin.

Deferred findings from Plan 1 reviews, to triage while writing Plan 2. Rulings made during execution are listed last.

## Deferred minors
- Task 1: minor (deferred): base.json module casing duplicated (nodenext vs NodeNext); no lint/typecheck outputs in turbo.json; eslint 9.39.5 deprecated warning
- Task 2: minor (deferred): no RED run for module-deps rule; duplicate module names give misleading cycle error; rule ignores dynamic import()/require; test case c/sub path mislabelled; unregistered module gives no hint; schemas lack email/length validation (tighten in T8/T9)
- Task 3: minor (deferred): Permission model alignment (prisma format); AuditLog [entity,entityId] index redundant with [entity,entityId,changedAt] (brief-mandated); CI needs services:up + deploy before db tests
- Task 4: minor (deferred): verifyAccessToken casts payload without shape guard (carry into T6); refreshLifetimeMs('0d') returns 0
- Task 5: minor (deferred): rollback test could pass vacuously (id ''); commit test checks by id not marker count; payload cast unchecked (constrain T to InputJsonValue); ../db/.env relative path
- Task 6: minor (deferred): permissions array elements not type-checked; malformed-payload test covers one combined case; no tests for ZodError 400 / 500 / parseOrigins
- Task 7: minor (deferred): seed opaque error if SEED_ADMIN_EMAIL exists as non-admin; seed writes not transactional; @erp/auth+contracts could be devDeps of db; db tests need migrated dev DB in CI
- Task 8: minor (deferred): login timing oracle on unknown email (dummy hash compare); no refresh-token reuse detection; refresh rotation commits before loadPublicUser (can strand session); no rate limiting; test fixtures not idempotent after crashed run; no expired-token refresh test
- Task 9: minor (deferred): `before/after as never` casts in roles.service; N+1 list loaders; concurrent role delete → 500 not 409; tests deactivate seeded admin temporarily (interrupted run leaves it inactive); requireAuth doesn't re-check isActive (bounded by 15m token); config-eslint package has no lint script
- Task 10: minor (deferred): unknown icon names fall back silently; filterNav test gaps (mixed null+granted); shadcn (zod 3) as runtime dep of @erp/ui
- Plan1: minor (deferred, controller): apps/api/.env.example DATABASE_URL uses port 5432 but compose maps 5433
- Task 11: minor (deferred): UI shows Roles/Deactivate on SUPER_ADMIN rows to user.manage-only callers (API 403s); sidebar has no brand header; sign-out keeps returnTo; late-401 double refresh; role description can't be cleared; generic role-form error; search not debounced; prod API URL falls back to localhost; no tests for unreachable/locks/layout gating
- Task 12: minor (deferred): migration recipe should mkdir -p the migration dir first
- No POST /users mixed-case email test; rate limiter is per-process (needs shared store for multi-instance).
- Server-side mustChangePassword enforcement (deferred to Plan 3).
- Refresh-token reuse detection; refresh-token row pruning (worker, Plan 7).
- Existing DBs don't receive new grants for non-SUPER_ADMIN system roles on seed — decide in Plan 2 how new module permissions reach HR_ADMIN etc.

## Rulings
- Ruling R1: module-deps rule takes module list as rule options ({ modules: {name, deps}[] }); apps/api and apps/web eslint configs pass it from @erp/contracts; config-eslint does not depend on contracts — breaks the package cycle — cost if wrong: small rewiring.
- Ruling R2: web transpilePackages = ['@erp/ui','@erp/contracts','@erp/auth'] — browser imports @erp/auth/permissions — cost if wrong: none.
- Ruling R3: T11 implementer verifies with build + curl; controller does the browser/screenshot check after T11 — cost if wrong: a UI bug surfaces later.
- Ruling R4: TypeScript 6.0.3 repo-wide instead of 7.0.2 — typescript-eslint 8.71.1 caps TS <6.1; HR-MNG-V1 never lints TS 7 (server no eslint, client TS 5.9.3); HMS proves 6.0.3 + typescript-eslint 8.71.1 — cost if wrong: slower tsc; bump to 7 when typescript-eslint supports it.
- Task 8: Ruling: replay of a revoked refresh token returns 401 without killing the whole session (faithful to HR-MNG-V1) — brief's "revoking that session" read as applying to inactive users — cost if wrong: stolen-token replay not detected; add reuse detection later.
- Task 9: Ruling: privilege-escalation findings are in scope — adding a role whose permissions are not all held by the caller → 403; deactivating or changing roles of a user who holds SUPER_ADMIN requires role.manage — spec §6 roles are editable bundles, escalation defeats them — cost if wrong: admins with user.manage but fewer perms can't hand out bigger roles (intended).
- Ruling R5: module-deps rule options entries get optional `folders: string[]` (default [name]); api/web configs map core → ['auth','users']; remove the eslint-disable in users.service.ts — core is one module spread over two folders per plan layout — cost if wrong: small rule change.
- Task 11: Ruling: add GET /api/users/role-options (user.manage) → {id,name}[] and point RoleSelect at it — Step 5 persona (user.manage only) must be able to create users — cost if wrong: one extra read endpoint.
- Task 11: Ruling: when mustChangePassword, (app)/layout renders only the dialog, not children; server-side enforcement deferred (token lacks the flag; Plan 3 with password reset) — cost if wrong: an API client can act before changing the temp password until then.
- Task 11: Ruling: include cheap minor — block dismissal of the one-time temporary password dialog.
- Ruling: final whole-branch review on sonnet, not the most capable model — user asked for lowest-cost models; per-task reviews already covered security paths — cost if wrong: a cross-cutting issue missed until Plan 2.
- Ruling F1: normalize email (trim+lowercase) in loginSchema/login and seed — cost if wrong: none.
- Ruling F2: createRole/updateRole: permissions newly added to a role must all be held by the caller, else 403 — closes role.manage → root escalation — cost if wrong: only super admins can widen roles beyond their own perms (intended).
- Ruling F3: document same-host (or path-proxied) API requirement in README/CLAUDE.md; web throws at build/start in production when NEXT_PUBLIC_API_URL unset; cross-domain cookie Domain support deferred — cost if wrong: deploy topology limited until revisited.
- Ruling F4: env.ts validates JWT_REFRESH_EXPIRY via refreshLifetimeMs (>0) and JWT_ACCESS_EXPIRY format at boot; refreshLifetimeMs rejects <=0.
- Ruling F5: dummy bcrypt compare for unknown email; rate-limit /auth/login and /auth/refresh (port HR-MNG-V1 server/src/utils/limiter.ts approach) — cost if wrong: tune limits later.
