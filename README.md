# pred

A prediction market for you and your friends. Full-stack TypeScript: an
Express + SQLite backend with a real order book, and a responsive React
frontend that works on desktop and mobile.

## How it works

- Everyone signs up and gets **$1,000** of play money. The **first account
  created becomes the admin**.
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

The whole app is a single Node process with a SQLite file, so it deploys
anywhere you can run a container or a Node server (Fly.io, Railway, Render, a
$5 VPS, ...). Just make sure the database path is on a persistent volume.

## Admin notes

- The first registered user is the admin.
- An admin can promote others: `POST /api/admin/users/:id/promote` (with their
  auth token).
