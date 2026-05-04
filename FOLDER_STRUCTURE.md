# Project layout (human-readable)

This file is a plain-language map of the repository. For setup steps and API details, see [README.md](README.md).

---

## Mental model

Think of it in four layers:

1. **`src/server.ts`** — boots the HTTP server.
2. **`src/app.ts`** — wires Express (security headers, body parsers, routes, error handling).
3. **`src/modules/*`** — **features**: each folder is one area (here: `auth`, `health`).
4. **`prisma/`** — **database shape** and **migrations** (the contract between your TypeScript code and PostgreSQL).

Everything under `src/lib/` and `src/middleware/` is **shared plumbing** reused by modules.

---

## Directory tree (abbreviated)

```
test-task-backend/
├── Dockerfile                 # How the API image is built for Docker
├── docker-compose.yml         # Postgres + API services for local full-stack runs
├── docker-entrypoint.sh       # Runs migrations, then starts Node (used by Dockerfile)
├── package.json               # Dependencies and npm scripts
├── tsconfig.json              # TypeScript compiler options
├── .env.example               # Template for secrets and config (copy to `.env`)
├── .nvmrc                     # Suggested Node version (22)
│
├── prisma/
│   ├── schema.prisma          # Models: User, tokens, etc.
│   └── migrations/            # Versioned SQL applied to the database over time
│
├── postman/
│   └── Auth-Foundation.postman_collection.json   # Ready-made API requests
│
└── src/
    ├── server.ts              # Entry: listens on PORT
    ├── app.ts                 # createApp(): Express instance + global middleware + routers
    │
    ├── config/
    │   └── env.ts             # Loads and validates environment variables (fail-fast on boot)
    │
    ├── lib/                   # Small reusable helpers (no route handlers here)
    │   ├── db.ts              # Prisma client singleton
    │   ├── jwt.ts             # Sign / verify access JWTs
    │   ├── tokenHash.ts       # Hash opaque refresh & reset tokens before storing
    │   ├── httpErrors.ts      # AppError type + factory helpers
    │   └── asyncHandler.ts    # Wraps async route handlers so errors reach Express
    │
    ├── middleware/
    │   ├── errorHandler.ts    # Turns thrown errors into consistent JSON responses
    │   └── requireAuth.ts     # Bearer JWT + token-version check for protected routes
    │
    ├── types/
    │   └── express.d.ts       # Adds `userId` on Express Request (for TypeScript)
    │
    └── modules/
        ├── health/
        │   └── health.routes.ts      # GET /health
        │
        └── auth/
            ├── auth.routes.ts       # Mounts paths like POST /auth/login
            ├── auth.controller.ts   # Parses body, calls service, sends HTTP status + JSON
            ├── auth.service.ts      # Business logic + Prisma calls (register, login, …)
            └── auth.schemas.ts      # Zod schemas for request bodies
```

---

## What goes where (quick guide)

| Location | Role |
|----------|------|
| **`modules/<name>/`** | One **feature**: routes → controller → service. Add `modules/billing/` later the same way. |
| **`lib/`** | Code that **any** module might need: DB client, crypto helpers, errors. |
| **`middleware/`** | Express **cross-cutting** behavior: auth gate, global errors. |
| **`config/`** | Single place to **validate env** so misconfiguration fails at startup, not mid-request. |
| **`prisma/`** | **Truth** for tables and columns; migrations keep production DBs in sync. |

---

## Root files you might touch often

| File | Why it matters |
|------|----------------|
| **`.env`** | Your local secrets (created from `.env.example`; not committed). |
| **`docker-compose.yml`** | Spin up Postgres + API together; overrides some env inside containers. |
| **`README.md`** | How to run, migrate, and exercise the API. |

---

## Adding a new feature later

1. Add routes under `src/modules/<feature>/`.
2. Keep handlers thin: **controller** validates input → **service** owns logic → **Prisma** for persistence.
3. If you need new tables, change **`prisma/schema.prisma`** and run **`prisma migrate`** (see README).

This keeps authentication from turning into a “god module” as the product grows.
