# Auth REST API foundation

Node.js **22** + **TypeScript** + **Express** + **PostgreSQL** + **Prisma**. User registration, login, Argon2 password hashing, JWT access tokens, opaque refresh tokens (stored hashed), password reset via hashed reset tokens, validation with **Zod**, and centralized error handling.

## Prerequisites

- **Node.js 22** (use [nvm](https://github.com/nvm-sh/nvm): `nvm install 22` then `nvm use 22`; this repo includes [`.nvmrc`](.nvmrc))
- **PostgreSQL 14+** (local install or Docker)
- **npm** 10+

## Quick start

```bash
nvm use 22
cd test-task-backend
cp .env.example .env
# Edit .env: set long random JWT_ACCESS_SECRET and JWT_REFRESH_SECRET (32+ chars each)
```

**Option A — Postgres in Docker, API on your machine (typical local dev)**

Start only PostgreSQL:

```bash
docker compose up -d postgres
```

Apply migrations, then run the API:

```bash
npx prisma migrate deploy
npm run dev
```

Keep `DATABASE_URL` in `.env` pointing at `localhost:5432` (see [`.env.example`](.env.example)).

**Option B — Full stack in Docker (Postgres + API)**

Ensure `.env` exists (`cp .env.example .env`) with strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Compose injects `DATABASE_URL` for the API container so it reaches the `postgres` service; your file still supplies JWT and other settings.

```bash
docker compose up --build -d
```

On first start, the API image runs `prisma migrate deploy` via [`docker-entrypoint.sh`](docker-entrypoint.sh), then starts Node. The API is exposed at `http://localhost:${API_PORT:-3000}` (override host port with `API_PORT` if 3000 is busy). Postgres is mapped to host **5432** for optional tools (e.g. Prisma Studio).

If Postgres shows **unhealthy** or `dependency failed to start`: allow first-time DB init to finish (watch `docker compose logs -f postgres`), ensure nothing else uses host port **5432** (`lsof -i :5432`), or map another host port (e.g. `"5433:5432"` under `postgres.ports`). If logs say **`No space left on device`**, free space on the Mac and in Docker (Disk Utility, **Docker Desktop → Settings → Resources** disk limit, then `docker system prune -a` and remove old images), then `docker compose up` again. Rarely, reset the named volume after `docker compose down` with **`docker volume rm test-task-backend_pgdata`** (destroys DB data), then `docker compose up --build -d` again.

To skip migrations in the container (advanced): set `SKIP_MIGRATE=true` on the `api` service.

The server listens on `PORT` from `.env` (default **3000**); in Compose the container listens on 3000 internally. Verify with `GET http://localhost:3000/health` (or your mapped port).

## Environment variables

See [`.env.example`](.env.example). Important fields:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | HS256 key for **access** JWTs (min 32 characters) |
| `JWT_REFRESH_SECRET` | Server secret used as **HMAC** key when hashing opaque **refresh** and **password-reset** tokens before storage |
| `ACCESS_TOKEN_TTL_SEC` | Access JWT lifetime (default 900 s) |
| `REFRESH_TOKEN_TTL_SEC` | Refresh token row lifetime (default 7 days) |
| `PASSWORD_RESET_TTL_SEC` | Reset token row lifetime (default 1 hour) |
| `PASSWORD_RESET_RETURN_TOKEN` | If `true`, `forgot-password` includes `resetToken` in JSON (for Postman). In `production` with `false`, the token is **only logged** server-side once |
| `CORS_ORIGIN` | Optional comma-separated browser origins, or `*` |

**Secrets:** use different long random values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Never commit real `.env` files.

### Why these secrets are in `.env` (not in the database)

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are **server cryptographic material** (signing access JWTs; HMAC “pepper” for hashing opaque refresh/reset tokens before persistence). They are intentionally kept **outside** the application database:

- **Separation of concerns:** Postgres holds **user accounts** and **token/session metadata** (hashes, expiry, revocation). The **keys** used to sign JWTs and derive stored hashes live with the **runtime** (here, `.env`; in production, a secrets manager or KMS), which is the usual pattern.
- **Risk if the DB leaks:** A dump that contains both **hashed tokens** and the **same secret** used to build those hashes weakens the defense-in-depth story. Keeping the pepper/signing key out of the DB means a **DB-only** compromise is less useful to an attacker.
- **JWT verification:** Access tokens are verified with a key the process already trusts; loading a signing key from the DB on every request adds latency, caching, rotation plumbing, and bootstrapping complexity (something still has to authenticate the first DB read).

At larger scale, the same idea applies: replace `.env` with **AWS Secrets Manager**, **GCP Secret Manager**, **Vault**, **Kubernetes secrets**, etc.—still not “a row next to `users`” unless you have a dedicated key-management design (often with encryption and strict access control).

## API overview

Base URL: `http://localhost:3000` (adjust for your `PORT`).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | — | Liveness |
| POST | `/auth/register` | — | Create user; returns `user`, `accessToken`, `refreshToken` |
| POST | `/auth/login` | — | Returns `user`, `accessToken`, `refreshToken` |
| POST | `/auth/refresh` | — | Body: JSON or **form** `refreshToken=…`; returns new `accessToken` (refresh row unchanged) |
| POST | `/auth/logout` | — | Body: JSON or **form** `refreshToken=…`; revokes that refresh token (`204` empty body) |
| POST | `/auth/forgot-password` | — | Body: `{ "email" }`; always same neutral `message`; creates reset row if user exists; may return `resetToken` (see `PASSWORD_RESET_RETURN_TOKEN` / `NODE_ENV`) |
| POST | `/auth/reset-password` | — | Body: JSON or **form** `token` + `newPassword`; resets password, revokes refresh sessions, returns new tokens |
| GET | `/auth/me` | Bearer access JWT | Current user profile |

Errors use shape: `{ "error": { "code", "message", "details?" } }`.

## Postman

Import [`postman/Auth-Foundation.postman_collection.json`](postman/Auth-Foundation.postman_collection.json). Set the collection variable `baseUrl` (default `http://localhost:3000`). Successful **register**, **login**, **refresh**, **forgot-password** (when `resetToken` is present), and **reset-password** responses auto-save tokens into collection variables via test scripts.

Manual flow without scripts: copy `accessToken` from login/register into the **Authorization** header as `Bearer <token>` for `GET /auth/me`.

**Postman and `{{refreshToken}}`:** In **raw JSON**, Postman can substitute variables in a way that drops quotes, producing invalid JSON (server logs show `"refreshToken": TOKEN` with no quotes). Fixes: use **Body → x-www-form-urlencoded** with key `refreshToken` and value `{{refreshToken}}` (the bundled collection does this for refresh, logout, and reset-password), or build the body in a **Pre-request Script** with `JSON.stringify({ refreshToken: pm.collectionVariables.get('refreshToken') })`.

**Logout (`POST /auth/logout`):** send `refreshToken` as JSON **or** `application/x-www-form-urlencoded`. No **Authorization** header required. Wrong or revoked token → **401** `INVALID_TOKEN`. After server changes: `docker compose up --build -d`.

## Folder structure

A plain-language walkthrough of the same layout: [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md).

| Path | Role |
|------|------|
| [`src/server.ts`](src/server.ts) | HTTP server entry |
| [`src/app.ts`](src/app.ts) | Express app factory (`createApp`) — middleware and routes |
| [`src/config/env.ts`](src/config/env.ts) | Zod-validated environment |
| [`src/lib/`](src/lib/) | Shared helpers (`db`, JWT, token hashing, errors, async route wrapper) |
| [`src/middleware/`](src/middleware/) | `requireAuth`, global `errorHandler` |
| [`src/modules/auth/`](src/modules/auth/) | Auth routes, controllers, services, Zod request schemas |
| [`src/modules/health/`](src/modules/health/) | Health check route |
| [`src/types/express.d.ts`](src/types/express.d.ts) | `Request.userId` typing |
| [`prisma/schema.prisma`](prisma/schema.prisma) | Database models |
| [`prisma/migrations/`](prisma/migrations/) | SQL migrations (run with Prisma CLI) |
| [`postman/`](postman/) | Postman collection |
| [`Dockerfile`](Dockerfile) | Multi-stage production image (Node 22, Prisma migrate on start) |
| [`docker-compose.yml`](docker-compose.yml) | `postgres` + `api` services |
| [`docker-entrypoint.sh`](docker-entrypoint.sh) | Runs `prisma migrate deploy` then `node dist/server.js` |
| [`.dockerignore`](.dockerignore) | Keeps build context small |

New domains later (e.g. organizations, billing) can follow the same `src/modules/<domain>/` layout without growing the auth module indefinitely.

## Database schema

- **`users`**: `id` (UUID), unique `email`, `password_hash`, **`token_version`** (incremented on logout / password reset so access JWTs with an older `tv` claim stop working), timestamps  
- **`refresh_tokens`**: opaque refresh strings are **HMAC-SHA256** hashed with `JWT_REFRESH_SECRET` before insert; `revoked_at` for logout  
- **`password_reset_tokens`**: same hashing approach; `used_at` prevents reuse  

Migrations are in [`prisma/migrations`](prisma/migrations). For a fresh database: `npx prisma migrate deploy`. During active schema development: `npm run prisma:migrate` (`prisma migrate dev`).

## How another developer can review locally

1. `nvm use 22` and `npm install` (runs `prisma generate` via `postinstall`).
2. Copy `.env.example` → `.env`; set strong JWT secrets.
3. Either: **(a)** `docker compose up -d postgres`, `npx prisma migrate deploy`, `npm run dev`, or **(b)** `docker compose up --build -d` for the full stack in containers.
4. Hit `/health`, then auth endpoints (Postman or `curl`).
5. Optional: `npm run build` then `npm start` to verify a host-built production run (without Docker for the API).

Optional: `npm run prisma:studio` to inspect tables (with Postgres reachable from the host).

## Security notes (test-task scope)

- Passwords hashed with **Argon2**. Access JWTs are short-lived HS256 tokens.
- Refresh and reset **plaintext tokens never hit the database**; only **HMAC-SHA256** digests keyed by `JWT_REFRESH_SECRET` are stored. Anyone with both DB dumps and that secret could still verify guessed tokens—acceptable for this scope; rotate secrets if the DB is compromised.
- `forgot-password` responds with the same message whether or not the email exists, to reduce account enumeration.
- **Helmet** enabled; **CORS** only when `CORS_ORIGIN` is set. For production, add rate limiting, monitoring, and HTTPS termination.

## Scripts

| Script | Command |
|--------|---------|
| Dev (watch) | `npm run dev` |
| Build | `npm run build` |
| Start (after build) | `npm start` |
| Migrations (dev) | `npm run prisma:migrate` |
| Migrations (deploy) | `npm run prisma:migrate:deploy` |
| Prisma Studio | `npm run prisma:studio` |

## Implementation summary

- **Express** JSON API with **Zod** validation and a small **AppError** taxonomy mapped by one error middleware.
- **Prisma** models: `User`, `RefreshToken`, `PasswordResetToken` with PostgreSQL migrations committed to the repo.
- **Registration / login** return user plus **access** + **refresh** tokens; refresh tokens persisted as **HMAC-SHA256** hashes.
- **JWT** access auth via **`jose`** (`GET /auth/me` protected).
- **Refresh** mints a new access token only (no refresh rotation—documented extension point).
- **Logout** revokes the provided refresh token and **increments `token_version`**, so existing access JWTs fail `requireAuth` until you **login or refresh** for a new access token.
- **Password reset**: create hashed reset token; in development (or when `PASSWORD_RESET_RETURN_TOKEN=true`) the plaintext reset token is returned in JSON for Postman; in production with the flag off, it is logged once server-side instead.

No Stripe, multi-tenant companies, roles, admin UI, or frontend integration—by design.
