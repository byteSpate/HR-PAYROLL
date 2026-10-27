# Git workflow

Same rules as the HMS project, with two remotes instead of three. Applies to people and AI agents. The short version is in [CLAUDE.md](../CLAUDE.md).

## 1. Branches

| Branch        | Purpose                                                                     | Changes only through                 |
| ------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| `main`        | Deployable code only. Every deploy comes from `main`.                       | Release PRs from `dev`, hotfix PRs   |
| `dev`         | Integration branch and GitHub default branch. All features land here first. | Squash-merged PRs from work branches |
| work branches | One per task, created from `dev`, deleted after merge                       | Commits by the author                |
| `hotfix/*`    | Urgent fix for production, created from `main`                              | Commits by the author                |

Never commit directly to `main` or `dev`.

## 2. Branch names

`<type>/<task-id>-<short-slug>`, lowercase slug with hyphens. Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `hotfix`. Use the task ID when there is one; without one, the slug alone is fine (`feat/foundation`).

## 3. Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <subject>

<body: why the change was made, what it affects>

Refs: <task id>
```

- **type:** `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `build`, `ci`.
- **scope:** the area, e.g. `auth`, `db`, `api`, `web`, `ui`, `leave`, `payroll`.
- **subject:** imperative, lowercase start, no full stop, at most 72 characters.
- **Plain ASCII punctuation only** (no em dashes, curly quotes or arrows).
- **No AI attribution:** no `Co-Authored-By: Claude`, no "Generated with Claude Code", no session link. `.claude/settings.json` turns it off.

Small commits on a work branch are fine; they are squashed when the PR merges.

## 4. Pull requests into `dev`

1. Branch from an up-to-date `dev`: `git switch dev && git pull origin dev && git switch -c feat/<slug>`.
2. Push the branch to **both remotes** (section 7) and open the PR on `origin` (byteSpate/HR-PAYROLL) with base `dev`.
3. **PR title** = the future squash commit, e.g. `feat(leave): leave requests and approvals`.
4. PR description: what, why, tests run, screenshots for UI, and `Deploy impact` (new env vars, migrations, new services, build steps, origin or CORS changes, tool version bumps; `Deploy impact: none` if nothing).
5. **CI must be green** before merging (once CI exists).
6. **Review:** when an AI agent wrote the code, a human reviews it before merge.
7. **Squash merge**, then delete the branch on both remotes.

## 5. Releases into `main`

1. Open a PR `dev` -> `main` titled `release: vX.Y.Z` with a "Deploy impact" list covering every change since the last release.
2. **Merge commit** (not squash), so `main` keeps the feature history.
3. Tag the merge commit and push the tag to both remotes: `git tag -a vX.Y.Z -m "vX.Y.Z" && git push origin vX.Y.Z && git push reza vX.Y.Z`.
4. SemVer, `0.x.y` until the first client go-live.
5. A release must not include a migration that is unsafe while the previous version still runs (expand first, contract in a later release).

## 6. Hotfixes

1. `git switch main && git pull origin main && git switch -c hotfix/<slug>`.
2. Fix with a test, PR into `main`, merge commit, tag a patch version.
3. Merge `main` back into `dev` straight away so the fix is not lost.

## 7. Remotes

Every branch and tag is pushed to both remotes:

```bash
git push origin <branch> && git push reza <branch>
```

| Remote   | Repository           | Role                                  |
| -------- | -------------------- | ------------------------------------- |
| `origin` | byteSpate/HR-PAYROLL | Main repository; PRs and CI live here |
| `reza`   | rezaulrht/HRMS-ERP   | Backup (full mirror)                  |

After a branch is merged, delete it on both: `git push origin --delete <branch> && git push reza --delete <branch>`.

Never force-push `main` or `dev`. On a work branch, force-push (`--force-with-lease`) only before review starts. If a remote rejects a push, fetch and investigate instead.
