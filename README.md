# pred

A prediction market for you and your friends. Full-stack TypeScript: an
Express + SQLite backend with a real order book, and a responsive React
frontend that works on desktop and mobile.

> ⚠️ **Just for fun — not real money.** This is a hobby project for playing
> prediction markets with friends. Every account is funded with **play money
> only**. There is **no real currency, no deposits, no withdrawals, and
> nothing of monetary value** anywhere in the app. The "$" amounts, balances,
> payouts, and leaderboard are all imaginary points. This is **not** a
> gambling service, a financial product, or investment advice, and it is **not
> affiliated with any real exchange or prediction market**. Use it for
> entertainment among friends only.

## How it works

- Everyone signs up and gets **$1,000** of play money — fake points with no
  real-world value whatsoever. The **first account created becomes the
  admin**.
- Anyone can **create a market** — a yes/no question like *"Will Sam finish
  the marathon?"*
- Markets trade binary shares priced in cents (1–99¢). A **YES share pays
  $1.00** if the market resolves YES; a **NO share pays $1.00** if it
  resolves NO.
- Trading happens on a standard **limit order book**. Every order is a buy of
  one side: a YES buy at 60¢ crosses with a NO buy at 40¢ (or better), and the
  pair of buyers mint a YES/NO share pair whose $1.00 is escrowed until
  resolution. Orders execute at the resting order's price, so takers keep any
  price improvement.
- To **exit a position**, buy the opposite side — whenever you hold both YES
  and NO shares, matched pairs are automatically redeemed for $1.00 each.
- Only **admins can resolve** markets: YES, NO, or VOID (refunds 50¢ per
  share to each side). Resolving cancels and refunds all open orders.
- A **leaderboard** ranks everyone by net worth (cash + open orders +
  positions marked at the last traded price).
- A **portfolio** page shows all of your open orders (cancellable from there)
  and every position you hold across markets.

## Development

Requires Node 22+.

```bash
npm install
npm run dev
```

This runs the API server on http://localhost:3000 and the Vite dev server on
http://localhost:5173 (with `/api` proxied to the backend). Open the Vite URL.

## Production / deployment

```bash
npm install
npm run build
npm start          # serves the built client + API on PORT (default 3000)
```

Or with Docker:

```bash
docker build -t pred .
docker run -p 3000:3000 -v pred-data:/data pred
```

Configuration (environment variables):

| Variable        | Default        | Purpose                                  |
| --------------- | -------------- | ---------------------------------------- |
| `PORT`          | `3000`         | HTTP port                                |
| `DATABASE_PATH` | `data/pred.db` | SQLite database file                     |
| `JWT_SECRET`    | auto-generated | Session signing key (persisted in DB if unset) |
| `SIGNUP_CODE`   | unset          | If set, registration requires this invite code |

The whole app is a single Node process with a SQLite file, so it deploys
anywhere you can run a container or a Node server (Fly.io, Railway, Render, a
$5 VPS, ...). The only state is the SQLite file, so point `DATABASE_PATH` at
storage that survives restarts.

### Deploying to Fly.io

Fly machines have ephemeral filesystems, so the database goes on a persistent
[Fly volume](https://fly.io/docs/volumes/). A ready-to-use `fly.toml` is
included — it mounts a volume at `/data` and sets `DATABASE_PATH=/data/pred.db`:

```bash
fly launch --no-deploy        # creates the app; keep the provided fly.toml
fly volumes create pred_data --size 1
fly secrets set SIGNUP_CODE=something-only-your-friends-know
fly deploy
```

**Register your own account immediately after the first deploy** — the first
account created becomes the admin. Setting `SIGNUP_CODE` keeps strangers who
stumble on the URL from joining; share the code with your friends along with
the link.

Notes:

- Run a **single machine** (the default with one volume): SQLite doesn't
  replicate across machines. `fly scale count 1` if you ever scaled up.
- The volume persists across deploys and restarts; everything else in the
  container is rebuilt each deploy.
- Optionally `fly secrets set JWT_SECRET=...` — otherwise a generated secret
  is persisted inside the database and sessions survive restarts anyway.

## Admin notes

The **first registered user is automatically the admin**, and only admins can
resolve markets. There are two ways to make additional users admins:

### Option 1: via the API (works anywhere)

Any existing admin can promote another user. First log in as the admin to get
a token, find the target user's id on the leaderboard, then call the promote
endpoint:

```bash
APP=https://your-app.fly.dev        # or http://localhost:3000

# 1. Log in as an admin and grab the token
TOKEN=$(curl -s -X POST $APP/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"YOUR_ADMIN_USERNAME","password":"YOUR_PASSWORD"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# 2. Find the user's id (the leaderboard lists everyone with their id)
curl -s $APP/api/leaderboard -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# 3. Promote user id 4 to admin
curl -s -X POST $APP/api/admin/users/4/promote -H "Authorization: Bearer $TOKEN"
```

### Option 2: directly in the database

Set the `is_admin` flag on the `users` table. Locally (with the server
stopped, or it's fine while running — SQLite handles it):

```bash
sqlite3 data/pred.db "UPDATE users SET is_admin = 1 WHERE username = 'friend';"
```

On Fly.io, the database lives on the volume at `/data/pred.db`. The container
doesn't ship the `sqlite3` CLI, but the server's own driver works:

```bash
fly ssh console
cd /app
node -e "require('better-sqlite3')('/data/pred.db')
  .prepare('UPDATE users SET is_admin = 1 WHERE username = ?').run('friend')"
```

To **demote** an admin, use the same database update with `is_admin = 0`
(there is no demote API endpoint).

### Resetting a forgotten password

An admin can set a new password for any user (find the user's id on the
leaderboard, as above):

```bash
curl -s -X POST $APP/api/admin/users/4/reset-password \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"password":"new-temporary-password"}'
```

Tell the user to log in with the temporary password. (There is no
self-service change-password flow yet, so pick something they're happy to
keep or reset it again later.)

## Disclaimer

This project is provided **for fun and educational purposes only**. It is a
toy prediction market played with **play money** — points that have **no
monetary value** and **cannot** be bought, sold, redeemed, deposited, or
withdrawn. Nothing in this app involves real currency or anything of value.

- It is **not** a gambling, betting, or wagering service.
- It is **not** a financial product, brokerage, exchange, or security, and
  nothing here is financial, investment, or trading advice.
- It is **not affiliated with, endorsed by, or connected to** any real
  prediction market, exchange, or financial institution.
- Any resemblance of the "$", balances, prices, or payouts to real money is
  purely cosmetic.

The software is provided "as is", without warranty of any kind. You are
responsible for ensuring that running it among your friends complies with the
laws and regulations that apply to you. Use it purely for entertainment.
