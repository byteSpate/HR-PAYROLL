# ERP

A modular ERP built as a Turborepo monorepo. Each business area is its own module, with a manifest, a folder in the API and the web app, and declared dependencies on other modules, so modules can be added or grown without editing one another. The first module is `core` (login, users, roles, settings).

Architecture, module rules and agent conventions are in [`CLAUDE.md`](CLAUDE.md) and [`docs/superpowers/specs/2026-10-27-erp-monorepo-design.md`](docs/superpowers/specs/2026-10-27-erp-monorepo-design.md).

## Prerequisites

- Node 24 (`>=24.9.0 <25`)
- pnpm 12.5.1
- Docker, for the dev Postgres

## First run

```sh
pnpm install

cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# Edit the copies: set the JWT secrets in apps/api/.env and the seed admin password in packages/db/.env.

pnpm services:up      # Postgres 17 on host port 5433
pnpm db:deploy        # apply migrations
pnpm db:generate      # generate the Prisma client
pnpm db:seed          # create system roles and the first admin
pnpm dev              # API on http://localhost:4000, web on http://localhost:3000
```

**Deployment:** serve the API from the same host as the web app (or proxy it under a path of it). The refresh cookie is host-only and `SameSite=Lax`, so a cross-domain API would not receive it; cross-domain support is a later change. `NEXT_PUBLIC_API_URL` is required in production builds.

The dev database listens on port 5433 because 5432 is often taken by another local Postgres. Stop it with `pnpm services:down`.
