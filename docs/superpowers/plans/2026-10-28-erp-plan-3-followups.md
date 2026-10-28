# ERP Plan 3 follow-ups

Things Plan 3 left open on purpose or could not finish. Each item says why, so the next plan can pick it up without re-deriving it.

## Not verified

- **Signed-in screens were not checked in a browser.** The login page was checked at 1440 px. The dashboard, attendance and leave pages are covered by component and API tests (565 tests at the time of writing) but nobody has looked at them. The Task 14 walkthrough (Bilal punches in and applies for leave, Amina approves, Amina cannot approve her own leave, the admin's grid shows the leave day) is still to do by hand.
- **No side-by-side with HR-MNG-V1.** Its server `.env` points at a shared remote database and its Docker ports (3000 and 4000) collide with ERP's. Run ERP on other ports for the comparison, for example web on 3100 and API on 4100 with `PORT`, `CLIENT_ORIGIN` and `NEXT_PUBLIC_API_URL` set at launch.

## Known gaps

- **Shift cannot be changed from the employee profile.** The shift is chosen when an employee is added. The API accepts `shiftId` on `PATCH /api/employees/:id` (HR only), but the profile has no picker, because it lists only fields it can render as text.
- **Late marks ignore approved half-day leave.** HR-MNG-V1 narrows the expected window on a half-day leave. Attendance may not import leave, so this needs a lookup injected the way the grid's `leaveDaysFor` is.
- **Sidebar has no count badges.** The original's `NavBadge` was not ported because nothing supplies counts yet (pending approvals are the obvious source).
- **Brand block is text.** The sidebar shows "ERP" in the heading font where the original has a logo image.
- **Account chip has no photo.** The session user carries no avatar; photos live on the employee record.
- **`FilterSelect` was not ported** (`@erp/ui` has no `Select` yet). `FilterBar` takes its controls as children.
- **Favicon returns 404.**

## Choices to confirm

- The `info` tag tone (`#E4EDFA` on `#2A5AA7`) is new; the original had four tones.
- Dated shift overrides are left out of the Add Employee shift picker because they apply to everyone inside their window.
- Shift deletion is refused while employees are assigned, rather than silently moving them to the default hours.

## Process notes

- `jsdom` and Testing Library were added as dev dependencies of `@erp/ui` and `@erp/web`. Tests that need a DOM opt in with `// @vitest-environment jsdom`; the default stays node.
- Mocking a web `api.ts` needs a factory (`vi.mock('./api', () => ({ ... }))`), because the vitest config has no `@/` alias and an automock still loads the real module.
- For the notifications kit, tests and implementation landed in the same step, so no separate failing run was recorded.
- Email delivery of notifications, scheduling `closeOpenDays`, and the digest and report jobs belong to the worker plan.
