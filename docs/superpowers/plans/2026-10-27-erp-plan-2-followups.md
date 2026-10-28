# Plan 2 follow-ups

Deferred findings and decisions from Plan 2 (access model, employee, department). Tasks 1, 0A and 0B were built by subagents with reviews; from Task 2 on the rest was built inline with test-first (red, then green) at the user's request.

## Deferred minors
- Task 1: minor (deferred): --concurrency=1 only on root script (CI calling turbo directly must add it); RoleRow type derived from findMany typeof; redundant `as string` in prepare-test-db
- Task 0A: minor (deferred): null-scope backfill keys on Permission.scopes (filled only by seed, so no-op at migrate time; harmless - no legacy scoped grants exist); unregister splice(-1) if called twice; makeActor loose cast; list/read routes still trust token (bounded by 15m TTL); build not re-run after fix round
- Task 0B: minor (deferred): legacy own/team grants show as Off in picker; accessLabel computed twice; select with only Off possible if a permission declares only own/team; no real RED run
- Department rename/delete and employee edits trust the token for list/read routes; only mutations that change access re-read the caller.
- Exit deactivation of a future last working day waits for the worker (Plan 7).
- Settlement freezing of exit details arrives with the settlement module (Plan 5).
- Employee code generation (EMP-0001) can race under concurrent hires; the loser gets a 409 and retries.

## Rulings
- | T1 -> 0A | test DB before access rework; T1 mentions ensureTestSuperAdmin | helper depends on 0A model. Ruling R1 |
- | 0A -> 0B | 0A drops UserRole/roles[]; web still uses them until 0B | typecheck breaks between tasks. Ruling R4 |
- | T8 nav vs T9 api | Employee List nav needs employee.read:department but api also allows employee.read.financial | Finance can't see nav item. Ruling R2 |
- | 0A Step 1 | "migration mapping tested in prepare-test-db fixtures" | no clear harness. Ruling R3 |
- Ruling R1: Task 1 only switches tests to erp_test (fresh DB, no seeded admin); the ensureTestSuperAdmin helper is added in 0A - cost if wrong: none.
- Ruling R2: NavItem.permission accepts string | string[] (any-of); Employee List = ['employee.read:department','employee.read.financial']; added in 0A contracts - cost if wrong: small type change.
- Ruling R3: migration data mapping is verified by the controller on the dev DB after migrate deploy (counts by accessLevel, roleId) instead of an automated fixture test - cost if wrong: mapping bug only affects dev data (no prod yet).
- Ruling R4: 0A may make minimal web edits so root typecheck/build stay green; 0B does the real UI - cost if wrong: none.
- Task 1: Ruling: fix race now - fileParallelism false (api, db, events), turbo test dependsOn ^test, atomic role list - shared erp_test makes parallel files race; role list 404 is also a real prod race - cost if wrong: slower test runs.
- Task 0A: Ruling: fix Important 1 (re-read caller accessLevel+active+grants from DB in a shared helper for every mutating user.manage/role.manage route) plus minors 2,3,4,5 - stale token after demotion/transfer is a real escalation window; minors are cheap - role renames go in a NEW migration (first one already applied on dev) - cost if wrong: one extra DB read per admin mutation.
- Ruling: Task 3 hook (registerGrantProvider/derivedGrants in apps/api/src/modules/auth/derived-grants.ts, used by loadPublicUser + loadActor) was already built in 0A; Task 3 residual (tests: no providers => role grants only; providers skipped for ADMIN/SUPER_ADMIN) is batched into the Task 2 dispatch - cost if wrong: none.
- Ruling: nav order already added in 0A with Settings = 900 (plan said 100); keep 900 - more room for modules, same relative order - cost if wrong: none.
- Task 7: Ruling: blank names in a one-column import are empty lines the parser skips (correct); tests use an over-long name as the invalid row. Row-cap overflow is a 400 (HR behaviour), not a per-row issue. One IMPORT audit row per department (HR behaviour) instead of one per import.
