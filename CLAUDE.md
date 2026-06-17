# CLAUDE.md

Guidance for working in this repo. Read this before making changes.

## What this is

`pred` is a play-money prediction market for a group of friends. Full-stack
TypeScript monorepo: an Express + SQLite backend with a real limit-order-book
matching engine, and a React + Vite frontend. Single Node process serves both
the API and the built client. **No real money** — all balances are imaginary
integer-cent points.

## Layout

```
/                 npm workspaces root (scripts orchestrate server + client)
server/           Express API + SQLite + matching engine (ESM, "type":"module")
  src/index.ts    App entry: mounts /api, serves client/dist in production
  src/db.ts       better-sqlite3 connection, schema (CREATE TABLE IF NOT EXISTS), constants
  src/auth.ts     bcrypt + JWT, register/login, requireAuth/requireAdmin middleware
  src/engine.ts   Order matching, cancel, resolve, payouts (the core logic)
  src/routes.ts   All HTTP endpoints (auth, markets, orders, tags, admin, portfolio, leaderboard)
client/           React 18 + react-router-dom 6, Vite 6
  src/api.ts      Typed fetch wrapper (api<T>()), shared interfaces, cents() formatter, token storage
  src/auth.tsx    Auth context/provider (useAuth)
  src/App.tsx     Routes + header nav
  src/pages/      Markets, MarketDetail, Portfolio, Leaderboard, Login
  src/components/ CandleChart
Dockerfile        Multi-stage build; runtime needs python3/make/g++ to build better-sqlite3
fly.toml          Fly.io deploy (single machine, volume at /data)
```

## Commands

- `npm install` — install all workspaces (run at root).
- `npm run dev` — server on :3000 (tsx watch) + Vite on :5173 (`/api` proxied). Open the Vite URL.
- `npm run build` — builds client then server (`tsc`).
- `npm start` — runs built server, serves client/dist + API on `PORT`.
- `npm run typecheck` — typechecks both workspaces. **Run this before committing**; there is no test suite or linter.

Requires Node 22+.

## Core domain model (read engine.ts before touching trading)

- All money is **integer cents**. Users start with `STARTING_BALANCE = 100_000` ($1,000).
- Binary markets: a **YES share pays 100¢** on YES resolution, a **NO share pays 100¢** on NO.
- Every order is a **buy** of one side. A YES buy at `p` and a NO buy at `q`
  cross when `p + q >= 100`. The matched pair mints a YES/NO share pair; the
  100¢ total is escrowed until resolution.
- **Trades execute at the resting order's price**; the taker pays `100 - resting.price` and is refunded any price improvement. Full order cost is reserved up front on placement.
- **Exiting = buying the opposite side.** When a user holds both YES and NO shares, `netPosition()` auto-redeems matched pairs for 100¢ each.
- **Resolve** (admin only): YES/NO pays 100¢ per winning share; VOID pays 50¢ per share to each side (returns the escrowed 100¢/pair). Resolving cancels and refunds all open orders.
- The book is stored as YES and NO buys; the market-detail endpoint presents NO buys to the client as YES asks at `100 - price` so the UI renders one classic book.

## Conventions & gotchas

- **DB writes that touch money/positions go through `db.transaction(...)`** in `engine.ts` (see `placeOrder`, `cancelOrder`, `resolveMarket`). Keep new multi-step money logic transactional.
- Schema is **idempotent DDL in db.ts** — there are no migration files. Adding a column means an `ALTER TABLE ... IF NOT EXISTS`-style guard or a new `CREATE TABLE IF NOT EXISTS`. There is no down-migration story.
- Throw `UserError` (from engine.ts) for client-visible 400s; `handleError` in routes.ts maps `Error`→400 and unknown→500.
- All `/api` routes except auth/config require `requireAuth`; admin actions add `requireAdmin`. `req.user` is populated by the middleware.
- **First registered user becomes admin** (`is_admin`). Only admins resolve markets, reset passwords, and promote users. No demote endpoint or self-service password change.
- `SIGNUP_CODE` env var, if set, gates registration with an invite code.
- Client talks to the API only via `api<T>()` in `client/src/api.ts`; JWT lives in `localStorage` under `pred_token`. Use `cents()` for displaying money.
- ESM throughout the server: **imports use `.js` extensions** (e.g. `./db.js`) even though sources are `.ts`.

## Config (env vars)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DATABASE_PATH` | `data/pred.db` | SQLite file |
| `JWT_SECRET` | auto-generated, persisted in `meta` table | Session signing key |
| `SIGNUP_CODE` | unset | If set, registration requires this invite code |

## Deploy

Single Node process + one SQLite file. Deploys to Fly.io via `fly.toml`
(single machine, volume mounted at `/data`, `DATABASE_PATH=/data/pred.db`).
SQLite does not replicate — **keep it to one machine**. See README.md for full
deploy steps and admin/password-reset API recipes.
