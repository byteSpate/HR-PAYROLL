# ERP Plan 5 (Part C) - Payroll, Settlement, Mail, Admin Employees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Payroll runs, payslips, final settlement and the mail kit work in the ERP as an exact copy of HR-MNG-V1's screens, for the employee (`/me/payroll`) and the one administrator who sees every route, and the pieces Parts A and B left waiting on payroll are joined up.

**Architecture:** As Plans 1 to 4 and the exact-port ledger. Each new module is a manifest in `@erp/contracts`, a Prisma file, an Express module in `apps/api`, and a module folder in `apps/web` holding copied HR-MNG-V1 components behind one `api.ts` adapter. Ledger posting HR-MNG-V1 does inside payroll and settlement becomes an outbox event (`emit(tx, type, payload)`). Mail is a shared package, `@erp/mail`, that records every message and never throws when no SMTP is set.

**Tech Stack:** As Plans 1 to 4. New dependency: `nodemailer` (exact version of HR-MNG-V1's `server/package.json`, no caret). PDF uses the existing `@erp/pdf` (`renderPdf`).

**Spec:** `docs/superpowers/specs/2026-10-27-erp-monorepo-design.md`. **Binding companions:** `2026-10-29-exact-port-ledger.md` (copy rules, deviations) and Part C of `2026-10-29-erp-plan-4-remaining-work.md`, which this plan replaces and expands. **Reference app:** `/home/reza/byteSpate/HR-MNG-V1` (call it HR-MNG-V1 everywhere, in UI text, PR text and plan prose; say "an administrator" in UI copy).

## Already done (do not redo)

- Exchange rates: `exchange` module, lookup that never assumes 1, Settings panel (B0). Payroll reads rates through its service.
- `@erp/pdf` (`renderPdf`, brand header CSS), `@erp/export`, `@erp/attachments`, `@erp/notifications`, `@erp/approvals`, `IdCounter` with `nextCounterValue` and `formatNumber`.
- Expense: claims stored with `payslipId` and `settlementId` as plain columns, REIMBURSED set only by `reimburseClaims`, which this Part calls inside its own transaction.
- Assets: `exitChecklist`, `listOpenRecoveries`, `sweepRecoveriesCollected`; `AssetRecovery` has plain `payrollAdjustmentId` and `settlementId` columns; the recoveries tab has no "Recover from payroll" button yet.
- Employee exit (`employee.exit.ts`), `monthlySummary` in attendance, leave services.

## Global Constraints

- Copy, do not write: files come from `HR-MNG-V1/client/components/<area>` and `HR-MNG-V1/server/src/modules/<module>`. Allowed edits: import paths and the data layer. No renamed props, restyled markup, new components or reworded copy. The porting recipe is in Plan 4's "Port rules".
- Out of scope, never ported: accounting, sales, statements, posting rules and `payroll.posting.ts` / `settlement.posting.ts` (replaced by events), the VAT panel, the Sales Hub flag.
- Two points of view only: the employee (`/me/...`) and one administrator who sees every route. Do not port `hr/*`, `finance/*`, `manager/*` pages. Do not change roles or permissions already built; the new permissions below are declared and granted to starter roles only, to be curated later (owner, 2026-10-29).
- Money is `Decimal` in the database and a string on the wire, validated with `positiveDecimal` / `nonNegativeDecimal` from `@erp/contracts`. Never `Number` for an amount. Dates are office-local (Asia/Dhaka), `@db.Date`; use `officeToday` and `formatDateOnly` from `@erp/export`.
- Anything that changes or decides a record takes the record's row lock and re-reads it inside its own transaction (the `lockX` pattern in `expense.lock.ts`, `asset.lock.ts`). Files leave storage only after the commit.
- Every mutation writes an audit row (`@erp/audit`) in the same transaction; every event type is listed in the owning manifest's `events`. Self-decision: only `ADMIN` and `SUPER_ADMIN` may decide their own run or settlement (`@erp/approvals`); everyone else gets 403.
- Out-of-scope record by id is a 404, never a 403 (payslips, settlements).
- Migrations: CLAUDE.md recipe (`migrate diff`, never `migrate dev`, keep `one_super_admin`). One migration per task that changes the schema. After a schema change: `pnpm db:deploy`, `pnpm db:generate`, `pnpm --filter @erp/db build`, `pnpm db:test:prepare`. After contract changes: `pnpm --filter @erp/contracts build`.
- Git: branch `feat/payroll-settlement` from `dev`. Conventional Commits, at most 72 characters, ASCII, no AI attribution. `git push origin <branch> && git push reza <branch>`. PR into `dev` with a `Deploy impact:` line. Run the git steps directly. Exact dependency versions. No mock data, dead or commented-out code.
- Dev: web 3100, API 4100, Postgres on 5433, login `admin@example.com` / `change-me-now`.
- Done means `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` pass (test files one at a time: `pnpm --filter @erp/api exec vitest run <file>`) and the new pages were opened in a browser against the dev database.

## Decisions to confirm before starting

1. **Payroll permissions** are declared `payroll.read`, `payroll.manage` (both scoped `department`/`all`), `payroll.approve`, `payroll.disburse` (both `all`), `payroll.config` (on/off, covers salary structures and payroll settings), plus `settlement.read`, `settlement.create`, `settlement.approve`, `settlement.pay`. The original splits Finance and HR by role; here adjustments use `payroll.manage`, structures `payroll.config`, assigning a structure to a person `employee.update`. Say so if you want a different split.
2. **Exit freeze is derived**, not stored: editing exit details answers 409 while the employee has an APPROVED or PAID settlement, as in HR-MNG-V1. Plan 4 proposed a `setExitFrozen` flag; a derived check cannot drift from the settlement.
3. **Decision and reminder emails** (expense, asset request, leave, national ID, payroll submitted) wait for the outbox handlers in Part E. This Part sends only mail a person asks for in the request: credentials / resend password, the three change-email messages, "Email payslips" for a run, and the statement on settlement pay.
4. **Bank file** is ported with the original's columns; matching a particular bank's format is a later change.

## Review Focus

1. **Two people process the same month at once.** One live run per month; the loser gets 409, no duplicate payslips (C5).
2. **Another employee's payslip or settlement by id.** 404; a manager cannot read a report's pay with only `employee.read:team` (C6, C7).
3. **Payslip rounding.** A payslip's total equals the sum of its lines to the cent; 3 claims of 33.33 reimburse 99.99; USD figures keep their frozen BDT twin (C4, C5).
4. **A claim or recovery consumed by a run that is then reprocessed or deleted.** The claim returns to APPROVED and the recovery to open; a second run cannot pay it twice (C5).
5. **Exit details after approval.** Frozen (409) while APPROVED or PAID; rejecting unfreezes (C7).
6. **Change-email race and reuse.** A confirm link works once, only for the pending address; a taken address is refused at request time and again at confirm (C2).

---

## File Structure

| Area | Files (create unless marked) |
|---|---|
| Mail kit | `packages/mail/{package.json,src/index.ts,src/send.ts,src/transport.ts,src/templates.ts,src/kinds.ts}`; `EmailDispatch` in `packages/db/prisma/schema/core.prisma` (modify) |
| Contracts | `packages/contracts/src/{payroll,settlement}/{manifest,schemas,types,events,index}.ts`; `registry.ts` (modify) |
| Schema | `packages/db/prisma/schema/{payroll,settlement}.prisma`; `employee.prisma` (modify: `salaryStructureId`); `expense.prisma`, `asset.prisma` (modify: real foreign keys) |
| Payroll API | `apps/api/src/modules/payroll/payroll.{routes,service,calc,money,fx,types,validators,settings,structure,adjustments,preflight,bankfile,pdf,mailer,storage,lock,events,view}.ts` |
| Settlement API | `apps/api/src/modules/settlement/settlement.{routes,service,calc,policy,lock,view,pdf}.ts` |
| Web | `apps/web/modules/{payroll,settlement}/{api,types,hooks}.ts` and `components/*`; admin employee components under `apps/web/modules/employee/components/` |
| Pages | `app/(app)/payroll/**`, `app/(app)/me/payroll`, `app/(app)/settlements`, `app/(app)/settings/payroll`, `app/(app)/employees/**` (replace the fresh screens) |

---

### Task C1: `@erp/mail`

**Files:** Create `packages/mail/**` as above; modify `core.prisma` (`EmailDispatch`), `apps/api/.env.example` (optional `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`); migration `<ts>_email_dispatch`. Test: `packages/mail/src/send.test.ts`.

**Interfaces:**
- Produces: `sendMail(input: { to: string; subject: string; html: string; kind: DispatchKind; entity?: string; entityId?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }): Promise<{ dispatchId: string; status: 'SENT' | 'FAILED' | 'SKIPPED' }>`. Never throws. `DispatchKind` lists the kinds this Part sends: `CREDENTIALS`, `PASSWORD_CHANGED`, `EMAIL_CHANGE_WARNING`, `EMAIL_CHANGE_CONFIRM`, `EMAIL_CHANGED`, `PAYSLIP`, `SETTLEMENT_STATEMENT`. `renderEmail(parts)` is a copy of HR-MNG-V1 `templates/email.ts` (brand layout, inline logo via `@erp/pdf`'s `brandAsset`). `listDispatches(query)` serves the Part D email log.
- `EmailDispatch` columns are HR-MNG-V1's (`to`, `kind`, `subject`, `entity`, `entityId`, `sentAt`, `error`, `createdAt`) with its three indexes; status is derived: `sentAt` set means SENT, `error` set means FAILED, neither means SKIPPED.

- [ ] **Step 1: Failing tests** (`send.test.ts`): with no `SMTP_HOST`, `sendMail` returns `SKIPPED` and writes one row with neither `sentAt` nor `error`; with a stub transport that throws, it returns `FAILED` and stores the message in `error` without rethrowing; with a stub that resolves, `SENT` and `sentAt` is set; the recipient is stored as given at send time; attachments reach the transport.
- [ ] **Step 2:** Run `pnpm --filter @erp/mail exec vitest run src/send.test.ts`; expect FAIL (package missing).
- [ ] **Step 3:** Create the package (workspace deps `@erp/db`, `@erp/pdf`; `nodemailer` at HR-MNG-V1's exact version, plus its `@types`). Port `utils/mailer.ts`: one send function that records first, sends, then updates the row; a settable transport for tests (`setTransportForTests`). Add the model and migration by the recipe.
- [ ] **Step 4:** Run the test and `pnpm --filter @erp/mail typecheck`; expect PASS.
- [ ] **Step 5:** Commit `feat(mail): shared mail kit with dispatch log`.

### Task C2: Account mail - resend password and change email

**Files:** modify `apps/api/src/modules/auth/**` and `users/**` (read both first; keep their structure), `packages/contracts/src/core/**` (schemas for the change-email endpoints); web: copy HR-MNG-V1's change-email dialog and pending-email notice into `apps/web/modules/settings/components/`, add a "Resend password" action on the Users page and the employee detail; extend `apps/web/modules/settings/api.ts`.

**Interfaces:**
- Consumes: `sendMail`, `renderEmail` (C1).
- Produces: `POST /auth/email-change` `{ newEmail, currentPassword }`; `POST /auth/email-change/approve` and `/confirm` taking the one-time token (SHA-256 stored, single use, expiry as in HR-MNG-V1 `auth.emailchange.ts`); `POST /users/:id/resend-credentials` (permission `user.manage`) sets a fresh temporary password with `mustChangePassword` and sends `CREDENTIALS`.
- The three messages are HR-MNG-V1's: warning to the old inbox, confirm link to the new, "changed" to both.

- [ ] **Step 1: Failing tests** (port `auth.emailchange.test.ts` and extend): requesting an address already used by another account is 409; the confirm token works once and a second use is 400; a token for a superseded request is refused (Review Focus 6); a successful change revokes the user's other sessions and records an audit row; resend-credentials replaces the old password (old login fails) and writes one `CREDENTIALS` dispatch; without `user.manage` it is 403.
- [ ] **Step 2:** Run each file; expect FAIL.
- [ ] **Step 3:** Port the flow; tokens from `crypto.randomBytes`, one transaction per step with the user row locked.
- [ ] **Step 4:** Run; expect PASS. Browser check: request a change as the admin, read the `SKIPPED` dispatch row, confirm through the link logged in the API output; resend a password from Users.
- [ ] **Step 5:** Commit `feat(auth): change email and resend credentials by mail`.

### Task C3: Payroll configuration - salary structures and settings

**Files:** Create `packages/contracts/src/payroll/{manifest,schemas,types,events,index}.ts` (permissions as in Decision 1; `deps: ['core','employee','attendance','leave','expense','asset','exchange','notification']`; nav under `Payroll & finance`: Salary structures; Settings child "Payroll settings"); `packages/db/prisma/schema/payroll.prisma` (`SalaryStructure`, `SalaryComponent`, `PayrollSetting` here; `PayrollAdjustment` comes in C4 and `PayrollRun`, `Payslip` in C5, each with its own migration); `employee.prisma` (`salaryStructureId` + relation); API `payroll.{routes,structure,settings,money,validators,types}.ts` and `payroll.structure.export` (audited XLSX/CSV through `@erp/export`); web: copy `salary-structures-page.tsx`, `payroll-settings-panel.tsx`, `salary-structure-dialog.tsx`; pages `app/(app)/payroll/salary-structures`, `app/(app)/settings/payroll`; `PUT /employees/:id/salary-structure` in the employee module (`employee.update`, audited as `EMPLOYEE_SALARY_STRUCTURE`).

**Interfaces:**
- Produces: `listStructures()`, `createStructure(actor, body)`, `updateStructure(actor, id, body)`, `deleteStructure(actor, id)` (409 while any employee uses it; currency immutable after creation), `getPayrollSettings(): Promise<{ deductLossOfPay: boolean; recoverAssetsFromSalary: boolean }>` (both true when no row), `updatePayrollSettings(actor, body)`.
- Starter grants: Finance Officer `payroll.read:all`, `payroll.manage:all`, `payroll.config`; HR Admin `payroll.read:all`, `payroll.manage:all`; Admin holds all implicitly.

- [ ] **Step 1: Failing tests** (port `payroll.structures.test.ts`, `payroll.settings.test.ts`, `payroll.structure.export.test.ts`): a structure with a duplicate component code is 400; currency cannot change after creation (409); deleting a structure in use is 409 naming the count; `GET` settings with no row returns both true; an export writes one audit row; a non-holder of `payroll.config` gets 403 on every write; assigning a structure to an employee records before and after in the audit.
- [ ] **Step 2:** Run each file; expect FAIL.
- [ ] **Step 3:** Contracts, schema, migration, services; copy the three components and add the Settings child. The employee view already exposes `payroll` (A5); fill in the structure name.
- [ ] **Step 4:** Run; expect PASS. Browser check: create a structure, assign it on an employee, flip each setting.
- [ ] **Step 5:** Commit `feat(payroll): salary structures, assignment and settings`.

### Task C4: Pay calculation, preflight and adjustments

**Files:** Create `apps/api/src/modules/payroll/payroll.{calc,fx,preflight,adjustments}.ts`; add `PayrollAdjustment` to `payroll.prisma` with its migration and the real foreign key on `AssetRecovery.payrollAdjustmentId` (modify `asset.prisma`); copy `adjustments-panel.tsx`, `adjustment-dialog.tsx`, `preflight-panel.tsx`, `payroll-shared.ts`; asset side: add the "Recover from payroll" action back to `recoveries-tab.tsx`, with the `recoverAssetsFromSalary` switch check (`POST /assets/recoveries/:id/recover-from-payroll`, `asset.manage`).

**Interfaces:**
- `computePayslip(input: { structure; employee; attendance: { calendarDays: number; lopDays: Decimal }; adjustments; reimbursements: Decimal; fxRateToBdt: Decimal; settings }): PayslipFigures`, pure, ported from `payroll.calc.ts`: loss of pay over **calendar** days, earnings pro-rated, deductions at a full month, reimbursements outside gross.
- `rateForMonthEnd(currency, year, month, tx?)` wraps the exchange lookup; throws a 409 naming the missing date when no rate exists.
- `preflight(year, month, tx?)` returns `{ blockers, warnings }` as HR-MNG-V1 does (no structure, no bank details, rate missing, open attendance, unapproved leave).
- `createAdjustment(actor, body)` (`payroll.manage`; reason required; currency may differ from the employee's), `deleteAdjustment` (409 once consumed).
- Reads attendance through an unscoped month function: if `attendance.summary.ts` has only the viewer-scoped `getMonthlySummary`, add `payrollInputs(year, month, employeeIds, tx?)` returning per-employee `calendarDays`, `absentDays`, `unpaidLeaveDays` (the contract Plan 3 froze), with its own test.

- [ ] **Step 1: Failing tests** (port `payroll.calc.test.ts`, `payroll.money.test.ts`, `payroll.fx.test.ts`, `payroll.preflight.test.ts`, `payroll.adjustments.test.ts`): the original's worked example (basic 50,000; 31 calendar days; 3 loss-of-pay days; net payable 65,958.06 with a 1,200 reimbursement); `grossPay - totalDeductions` equals `netPay` and the breakdown lines sum to the totals (Review Focus 3); `deductLossOfPay=false` charges nothing but still records the days; a USD structure stores the BDT twins from the frozen rate; preflight blocks an employee with no structure; an adjustment in BDT on a USD employee converts at the run rate; recovering from payroll is 409 while the switch is off.
- [ ] **Step 2:** Run each file; expect FAIL.
- [ ] **Step 3:** Port calc and money helpers unchanged (they are pure); write the thin database-reading wrappers; restore the recoveries action.
- [ ] **Step 4:** Run; expect PASS. Browser check: add an adjustment, view preflight, create a recovery and recover it from payroll.
- [ ] **Step 5:** Commit `feat(payroll): pay calculation, preflight and adjustments`.

### Task C5: Payroll runs

**Files:** Add `PayrollRun` and `Payslip` to `payroll.prisma` (migration with a **partial unique index** on `(year, month) WHERE "deletedAt" IS NULL`, replacing HR-MNG-V1's `activeKey` column); real foreign keys for `ExpenseClaim.payslipId` and `PayrollAdjustment.payslipId`; `payroll.{service,lock,events,bankfile,view}.ts`; copy `payroll-page.tsx`, `run-detail.tsx`; pages `app/(app)/payroll/page.tsx` (children per section of the original page: read it first) and a run-detail page if the original has one.

**Interfaces:**
- Lifecycle `DRAFT -> SUBMITTED -> APPROVED -> DISBURSED`; `createRun`, `processRun(actor, id, excludedEmployeeIds?)`, `submitRun`, `approveRun`, `rejectRun` (note required, back to DRAFT), `disburseRun`, `deleteRun` (draft only, soft). Each transition takes `lockRun`. The processor approving their own run is 403 unless admin level (`@erp/approvals`).
- `processRun` runs in one transaction under `pg_advisory_xact_lock(hashtext('payroll:<year>-<month>'))`, releases anything a previous process consumed (claims back to APPROVED with `payslipId` cleared, adjustments and recoveries freed), then writes one payslip per employee numbered `formatNumber('BS-PAY', await nextCounterValue(tx, 'PAY'))`, and marks consumed claims REIMBURSED through `reimburseClaims` with `paidOn` left empty until disburse.
- `disburseRun` sets `paidOn` on the consumed claims and marks recoveries COLLECTED; the rate at disbursement is stored as `disbursementFxRateToBdt`.
- Events (listed in the manifest): `payroll.run.finalized` on approve with totals by currency and per-employee BDT lines; `payroll.run.disbursed` on disburse.
- `GET /payroll/runs/:id/bank-file` (CSV, `payroll.disburse`, audited as an export) and `/bank-file/summary`.

- [ ] **Step 1: Failing tests** (port `payroll.runs.test.ts`, `payroll.bankfile.test.ts`, `payroll.posting.test.ts` as event assertions, `payroll.routes.test.ts`): two simultaneous `process` calls for one month leave one run and one 409, no duplicate payslips (Review Focus 1); reprocessing returns the consumed claim to APPROVED and the recovery to open, then consumes each exactly once (Review Focus 4); deleting a draft frees the month for a new run; a processor cannot approve their own run (403) but an admin can; reject needs a note; a non-draft run cannot be deleted; disbursing twice is 409; the bank file has one row per payee and its total equals the summary and the sum of `netPayable`; the `payroll.run.finalized` payload totals equal the payslip sums.
- [ ] **Step 2:** Run each file; expect FAIL.
- [ ] **Step 3:** Port `payroll.service.ts` in the original's segments (process, transitions, queries), swapping role checks for `requirePermission` and posting for `emit`.
- [ ] **Step 4:** Run; expect PASS. Browser check as the admin: a full run from create through disburse on seeded data, console clean.
- [ ] **Step 5:** Commit `feat(payroll): runs from process to disbursement with events`.

### Task C6: Payslips - PDF, email, `/me/payroll`

**Files:** Create `apps/api/src/modules/payroll/payroll.{pdf,mailer,storage}.ts` and `payslip.html` (copy of the original template); routes `GET /payroll/payslips/me`, `/payslips/employee/:employeeId`, `/payslips/:id`, `/payslips/:id/pdf`, `POST /payroll/runs/:id/email`, `GET /payroll/runs/:id/email-status` (register `/payslips/me` before `/payslips/:id`); copy `my-payslips.tsx`, `payslip-detail.tsx`, `payslips-card.tsx`; page `app/(app)/me/payroll/page.tsx`, the payslips card on the employee detail page; nav item under `Workspace`, no permission.

**Interfaces:**
- Consumes: `renderPdf` (`@erp/pdf`), `sendMail` (C1), run and payslip data (C5).
- Visibility `canReadPayslip(viewer, payslip)`: the owner, or a holder of `payroll.read` whose scope reaches the employee. `employee.read` alone never reveals pay. Anything else is a 404.
- `emailRun(actor, runId)` sends each payslip in turn with a concurrency limit from `createLimiter`, sets `emailedAt` / `emailError` per payslip, and refuses a second start while `emailStartedAt` is set and fresh (409); needs `payroll.manage`.
- Payslip PDFs are rendered on demand and cached through `@erp/attachments`; `pdfUrl` stores the storage id, never a public URL.

- [ ] **Step 1: Failing tests** (port `payroll.payslips.test.ts`, `payroll.pdf.test.ts`, `payroll.storage.test.ts`): another employee's payslip by id is 404 for an employee and for a holder of only `employee.read:team` (Review Focus 2); the owner's PDF response starts `%PDF` with a filename containing the payslip number; the run email writes one `PAYSLIP` dispatch per payslip, records `SKIPPED` without SMTP and leaves `emailedAt` empty; a second concurrent email start is 409; the total on the page equals the total in the PDF (both rendered from the same view function).
- [ ] **Step 2:** Run each file; expect FAIL.
- [ ] **Step 3:** Port; keep the ported test fixtures for amounts.
- [ ] **Step 4:** Run; expect PASS. Browser check as the Employee-role user: own list, detail, PDF download; as the admin: email a run and read the status.
- [ ] **Step 5:** Commit `feat(payroll): payslips with pdf, email and my payroll page`.

### Task C7: Settlement

**Files:** Create `packages/contracts/src/settlement/**` (permissions `settlement.read`, `settlement.create`, `settlement.approve`, `settlement.pay`; events `settlement.approved`, `settlement.paid`); `settlement.prisma` (`Settlement`, with real foreign keys from `ExpenseClaim.settlementId` and `AssetRecovery.settlementId`); `apps/api/src/modules/settlement/settlement.{routes,service,calc,policy,lock,view,pdf}.ts`; copy `components/settlement` (3 files: page, detail, exit dialog); page `app/(app)/settlements/page.tsx`; sidebar item under `Payroll & finance`; modify `employee.exit.ts` and `employee.service.ts` for the freeze.

**Interfaces:**
- Routes as the original: `GET /settlements`, `POST /settlements/:employeeId/calculate`, `GET /settlements/:employeeId`, `PATCH /settlements/id/:id` (override), `POST /settlements/id/:id/{approve,reject,pay}`; the employee has no route (their statement arrives by mail on pay).
- `calculateSettlement(actor, employeeId)` freezes exit facts, reads pending salary (pro-rated from the last payslip month), approved unpaid claims (`expense` service), open recoveries (`listOpenRecoveries`) and the exit checklist, and computes gratuity and notice pay from `settlement.policy.ts` (the original's Labour Act figures).
- `assertExitEditable(tx, employeeId)` in the employee module: 409 with the original's wording when a settlement is APPROVED or PAID.
- `approve` emits `settlement.approved` (all heads in BDT and currency); `pay` marks claims REIMBURSED and recoveries COLLECTED in the same transaction, emits `settlement.paid`, then renders the statement and mails it (`SETTLEMENT_STATEMENT`) after commit.

- [ ] **Step 1: Failing tests** (port `settlement.calc.test.ts` and `settlement.service.test.ts` with the original's fixtures): gratuity 30 days per year of basic wages (45 after 10 years); notice-pay shortfall by reason; pending salary pro-rated; heads sum to `finalAmount` to the cent (Review Focus 3); approving then editing exit details is 409, rejecting then editing succeeds (Review Focus 5); the calculator cannot approve their own settlement (403) but an admin can; another employee's settlement id is 404 for a non-holder; paying twice is 409 and consumes each claim and recovery once; calculating for an employee with no exit recorded is 409.
- [ ] **Step 2:** Run each file; expect FAIL.
- [ ] **Step 3:** Port; replace `settlement.posting.ts` with the events above.
- [ ] **Step 4:** Run; expect PASS. Browser check: record an exit, calculate, override, approve, pay; confirm the freeze on the employee page.
- [ ] **Step 5:** Commit `feat(settlement): final settlement with freeze, events and statement`.

### Task C8: Admin employees (list, detail, add)

**Files:** Replace the fresh admin screens in `apps/web/app/(app)/employees/**` and `apps/web/modules/employee/components/` with copies of HR-MNG-V1 `employees-page`, `employee-detail-page`, `edit-card-dialog`, `shift-dialog`, `exit-details-dialog`, `salary-structure-dialog`, `leave-balance-card` (read the originals; the add flow is the original's); delete the fresh `employee-table`, `employee-form` and their tests once the copies replace them and nothing else imports them; extend `apps/web/modules/employee/api.ts` with the original's call signatures. Add server routes only where an original call has no ERP route, and list them in the commit body.

**Interfaces:** Consumes the structure assignment (C3), exit routes, shift assignment and leave balances already in ERP; pay figures on the detail page are shown only to a holder of `payroll.read` whose scope reaches the person. Wire types stay in `@erp/contracts/employee`.

- [ ] **Step 1: Failing tests:** copy the original component tests; add a web test that the salary tab is absent without `payroll.read`, and an API test that the employee read omits pay for a viewer with only `employee.read`.
- [ ] **Step 2:** Run `pnpm --filter @erp/web exec vitest run <file>`; expect FAIL.
- [ ] **Step 3:** Copy and adapt imports; delete the replaced screens.
- [ ] **Step 4:** Run; expect PASS. Browser check list, add, edit a card, assign structure and shift, record exit.
- [ ] **Step 5:** Commit `feat(employee): exact HR-MNG-V1 admin employees screens`.

### Task C9: Wrap-up and PR

**Files:** `docs/superpowers/plans/2026-10-29-exact-port-ledger.md` (add a Part C section: what shipped and the deviations: permission split, derived exit freeze, partial unique index in place of `activeKey`, events in place of posting, decision mails deferred to Part E); `docs/superpowers/plans/2026-10-29-erp-plan-4-remaining-work.md` (mark Part C as moved to this plan); `packages/db/src/seed/starter-roles.ts` (final grants).

- [ ] **Step 1:** Run the full verification: `pnpm typecheck`, `pnpm lint`, `pnpm build`, then each Part C test file and the payroll, expense, asset, employee, attendance and leave suites one at a time; `pnpm db:deploy && pnpm db:seed` on the dev database.
- [ ] **Step 2:** Open every new page once as the admin and as the Employee-role user; the console shows only expected errors.
- [ ] **Step 3:** Update the ledger and the Plan 4 note; commit `docs: record Part C in the ledger`.
- [ ] **Step 4:** Push to both remotes and open the PR into `dev` with `Deploy impact:` listing the new migrations in order, `pnpm db:seed`, and the optional `SMTP_*` and `MAIL_FROM` variables (no SMTP means mail is recorded as skipped).

---

## Self-review

- **Spec coverage:** payroll (C3 to C6), settlement (C7), mail kit (C1), joins left open by Parts A and B (foreign keys and "Recover from payroll" in C4, C5 and C7; `paidOn` and `payslip` on claims in C5), admin employees (C8), resend password and self change-email (C2). Decision mails and the worker are named as Part E.
- **Names:** `sendMail` and `renderEmail` (C1) are used in C2, C6 and C7; `lockRun` and `processRun` (C5) are used in C6 and C7; `assertExitEditable` (C7) is the only freeze mechanism, replacing Plan 4's `setExitFrozen`.
- **Proportion:** each task names signatures, tests with their assertions and the ported files; bodies come from HR-MNG-V1.
