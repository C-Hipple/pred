import { Router } from "express";
import { db } from "./db.js";
import {
  login,
  publicUser,
  register,
  requireAdmin,
  requireAuth,
  signToken,
} from "./auth.js";
import { cancelOrder, placeOrder, resolveMarket, UserError } from "./engine.js";

export const api = Router();

function handleError(res: import("express").Response, err: unknown) {
  if (err instanceof UserError || err instanceof Error) {
    return res.status(400).json({ error: err.message });
  }
  return res.status(500).json({ error: "Something went wrong" });
}

// ---- Auth ----

api.post("/auth/register", (req, res) => {
  try {
    const user = register(req.body?.username, req.body?.password);
    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (err) {
    handleError(res, err);
  }
});

api.post("/auth/login", (req, res) => {
  try {
    const user = login(req.body?.username, req.body?.password);
    res.json({ token: signToken(user.id), user: publicUser(user) });
  } catch (err) {
    handleError(res, err);
  }
});

api.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user!) });
});

// ---- Markets ----

const lastTradePrice = (marketId: number): number | null => {
  const row = db
    .prepare(
      "SELECT price FROM trades WHERE market_id = ? ORDER BY id DESC LIMIT 1"
    )
    .get(marketId) as { price: number } | undefined;
  return row?.price ?? null;
};

api.get("/markets", requireAuth, (_req, res) => {
  const markets = db
    .prepare(
      `SELECT m.id, m.title, m.description, m.status, m.outcome, m.created_at,
              u.username AS creator,
              (SELECT COALESCE(SUM(quantity), 0) FROM trades t WHERE t.market_id = m.id) AS volume
       FROM markets m JOIN users u ON u.id = m.creator_id
       ORDER BY m.status = 'open' DESC, m.id DESC`
    )
    .all() as Record<string, unknown>[];
  res.json({
    markets: markets.map((m) => ({
      ...m,
      lastPrice: lastTradePrice(m.id as number),
    })),
  });
});

api.post("/markets", requireAuth, (req, res) => {
  const title = (req.body?.title || "").trim();
  const description = (req.body?.description || "").trim();
  if (title.length < 3 || title.length > 200) {
    return res.status(400).json({ error: "Title must be 3-200 characters" });
  }
  if (description.length > 2000) {
    return res.status(400).json({ error: "Description is too long" });
  }
  const result = db
    .prepare("INSERT INTO markets (title, description, creator_id) VALUES (?, ?, ?)")
    .run(title, description, req.user!.id);
  res.json({ id: Number(result.lastInsertRowid) });
});

api.get("/markets/:id", requireAuth, (req, res) => {
  const marketId = Number(req.params.id);
  const market = db
    .prepare(
      `SELECT m.*, u.username AS creator FROM markets m
       JOIN users u ON u.id = m.creator_id WHERE m.id = ?`
    )
    .get(marketId) as Record<string, unknown> | undefined;
  if (!market) return res.status(404).json({ error: "Market not found" });

  // Aggregate the book by price level. NO buys are shown to the client as
  // YES asks at (100 - price) so the UI can render one classic book.
  const book = (side: "YES" | "NO") =>
    db
      .prepare(
        `SELECT price, SUM(remaining) AS quantity FROM orders
         WHERE market_id = ? AND side = ? AND status = 'open'
         GROUP BY price ORDER BY price DESC`
      )
      .all(marketId, side) as { price: number; quantity: number }[];

  const trades = db
    .prepare(
      `SELECT t.price, t.quantity, t.taker_side, t.created_at,
              yu.username AS yes_user, nu.username AS no_user
       FROM trades t
       JOIN users yu ON yu.id = t.yes_user_id
       JOIN users nu ON nu.id = t.no_user_id
       WHERE t.market_id = ? ORDER BY t.id DESC LIMIT 30`
    )
    .all(marketId);

  const position = db
    .prepare(
      "SELECT yes_shares, no_shares FROM positions WHERE market_id = ? AND user_id = ?"
    )
    .get(marketId, req.user!.id) ?? { yes_shares: 0, no_shares: 0 };

  const myOrders = db
    .prepare(
      `SELECT id, side, price, quantity, remaining, created_at FROM orders
       WHERE market_id = ? AND user_id = ? AND status = 'open' ORDER BY id DESC`
    )
    .all(marketId, req.user!.id);

  res.json({
    market,
    lastPrice: lastTradePrice(marketId),
    yesBids: book("YES"),
    noBids: book("NO"),
    trades,
    position,
    myOrders,
    balance: req.user!.balance,
  });
});

// ---- Orders ----

api.post("/markets/:id/orders", requireAuth, (req, res) => {
  try {
    const result = placeOrder(
      req.user!.id,
      Number(req.params.id),
      req.body?.side === "NO" ? "NO" : "YES",
      Number(req.body?.price),
      Number(req.body?.quantity)
    );
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

api.delete("/orders/:id", requireAuth, (req, res) => {
  try {
    cancelOrder(req.user!.id, Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

// ---- Admin ----

api.post("/markets/:id/resolve", requireAuth, requireAdmin, (req, res) => {
  const outcome = req.body?.outcome;
  if (outcome !== "YES" && outcome !== "NO" && outcome !== "VOID") {
    return res.status(400).json({ error: "Outcome must be YES, NO or VOID" });
  }
  try {
    resolveMarket(Number(req.params.id), outcome);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

api.post("/admin/users/:id/promote", requireAuth, requireAdmin, (req, res) => {
  const result = db
    .prepare("UPDATE users SET is_admin = 1 WHERE id = ?")
    .run(Number(req.params.id));
  if (result.changes === 0) return res.status(404).json({ error: "User not found" });
  res.json({ ok: true });
});

// ---- Leaderboard ----

api.get("/leaderboard", requireAuth, (_req, res) => {
  // Net worth = cash + funds reserved in open orders + open positions marked
  // at the last traded price (50c if the market has never traded).
  const users = db
    .prepare("SELECT id, username, balance, is_admin FROM users")
    .all() as { id: number; username: string; balance: number; is_admin: number }[];

  const reservedStmt = db.prepare(
    `SELECT COALESCE(SUM(price * remaining), 0) AS reserved
     FROM orders WHERE user_id = ? AND status = 'open'`
  );
  const positionsStmt = db.prepare(
    `SELECT p.market_id, p.yes_shares, p.no_shares
     FROM positions p JOIN markets m ON m.id = p.market_id
     WHERE p.user_id = ? AND m.status = 'open'`
  );

  const rows = users.map((u) => {
    const reserved = (reservedStmt.get(u.id) as { reserved: number }).reserved;
    let positionsValue = 0;
    const positions = positionsStmt.all(u.id) as {
      market_id: number;
      yes_shares: number;
      no_shares: number;
    }[];
    for (const p of positions) {
      const last = lastTradePrice(p.market_id) ?? 50;
      positionsValue += p.yes_shares * last + p.no_shares * (100 - last);
    }
    return {
      id: u.id,
      username: u.username,
      isAdmin: !!u.is_admin,
      balance: u.balance,
      netWorth: u.balance + reserved + positionsValue,
    };
  });
  rows.sort((a, b) => b.netWorth - a.netWorth);
  res.json({ leaderboard: rows });
});
