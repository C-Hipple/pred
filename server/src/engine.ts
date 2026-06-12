/**
 * Order-matching engine.
 *
 * Markets trade binary contracts priced in cents (1-99). A YES share pays
 * 100c if the market resolves YES; a NO share pays 100c if it resolves NO.
 *
 * Every order is a *buy* of one side: "buy YES at p" or "buy NO at q".
 * A YES buy at p and a NO buy at q cross when p + q >= 100: the two buyers
 * fund a freshly minted YES/NO share pair (100c total, held in escrow until
 * resolution). Trades execute at the resting order's price, so the taker
 * keeps any price improvement.
 *
 * Selling out of a position is just buying the opposite side: whenever a
 * user ends up holding both YES and NO shares, matched pairs are
 * automatically redeemed for 100c each.
 */
import { db } from "./db.js";

export class UserError extends Error {}

interface OrderRow {
  id: number;
  market_id: number;
  user_id: number;
  side: "YES" | "NO";
  price: number;
  quantity: number;
  remaining: number;
  status: string;
}

const getBalance = db.prepare("SELECT balance FROM users WHERE id = ?");
const addBalance = db.prepare(
  "UPDATE users SET balance = balance + ? WHERE id = ?"
);
const subtractBalance = db.prepare(
  "UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?"
);
const upsertPosition = db.prepare(`
  INSERT INTO positions (market_id, user_id, yes_shares, no_shares)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (market_id, user_id) DO UPDATE SET
    yes_shares = yes_shares + excluded.yes_shares,
    no_shares  = no_shares  + excluded.no_shares
`);
const getPosition = db.prepare(
  "SELECT yes_shares, no_shares FROM positions WHERE market_id = ? AND user_id = ?"
);

/** Redeem matched YES/NO pairs a user holds for 100c each. */
function netPosition(marketId: number, userId: number) {
  const pos = getPosition.get(marketId, userId) as
    | { yes_shares: number; no_shares: number }
    | undefined;
  if (!pos) return;
  const pairs = Math.min(pos.yes_shares, pos.no_shares);
  if (pairs <= 0) return;
  upsertPosition.run(marketId, userId, -pairs, -pairs);
  addBalance.run(pairs * 100, userId);
}

export interface PlaceOrderResult {
  orderId: number | null;
  filled: number;
  remaining: number;
}

export const placeOrder = db.transaction(
  (
    userId: number,
    marketId: number,
    side: "YES" | "NO",
    price: number,
    quantity: number
  ): PlaceOrderResult => {
    const market = db
      .prepare("SELECT status FROM markets WHERE id = ?")
      .get(marketId) as { status: string } | undefined;
    if (!market) throw new UserError("Market not found");
    if (market.status !== "open") throw new UserError("Market is closed");
    if (!Number.isInteger(price) || price < 1 || price > 99)
      throw new UserError("Price must be a whole number of cents from 1 to 99");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000)
      throw new UserError("Quantity must be a positive whole number");

    // Reserve the full cost up front; improvements are refunded as we match.
    const cost = price * quantity;
    const deducted = subtractBalance.run(cost, userId, cost);
    if (deducted.changes === 0) throw new UserError("Insufficient balance");

    const oppSide = side === "YES" ? "NO" : "YES";
    const matches = db
      .prepare(
        `SELECT * FROM orders
         WHERE market_id = ? AND side = ? AND status = 'open' AND price >= ?
         ORDER BY price DESC, id ASC`
      )
      .all(marketId, oppSide, 100 - price) as OrderRow[];

    let remaining = quantity;
    for (const resting of matches) {
      if (remaining === 0) break;
      const tradeQty = Math.min(remaining, resting.remaining);
      // Execute at the resting order's price; taker pays 100 - resting.price.
      const takerPrice = 100 - resting.price;
      const refund = (price - takerPrice) * tradeQty;
      if (refund > 0) addBalance.run(refund, userId);

      const newRemaining = resting.remaining - tradeQty;
      db.prepare(
        "UPDATE orders SET remaining = ?, status = ? WHERE id = ?"
      ).run(newRemaining, newRemaining === 0 ? "filled" : "open", resting.id);

      const yesUser = side === "YES" ? userId : resting.user_id;
      const noUser = side === "NO" ? userId : resting.user_id;
      const yesPrice = side === "YES" ? takerPrice : resting.price;
      upsertPosition.run(marketId, yesUser, tradeQty, 0);
      upsertPosition.run(marketId, noUser, 0, tradeQty);
      db.prepare(
        `INSERT INTO trades (market_id, yes_user_id, no_user_id, price, quantity, taker_side)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(marketId, yesUser, noUser, yesPrice, tradeQty, side);

      netPosition(marketId, yesUser);
      if (noUser !== yesUser) netPosition(marketId, noUser);
      remaining -= tradeQty;
    }

    let orderId: number | null = null;
    if (remaining > 0) {
      const result = db
        .prepare(
          `INSERT INTO orders (market_id, user_id, side, price, quantity, remaining)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(marketId, userId, side, price, quantity, remaining);
      orderId = Number(result.lastInsertRowid);
    }
    return { orderId, filled: quantity - remaining, remaining };
  }
);

export const cancelOrder = db.transaction((userId: number, orderId: number) => {
  const order = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(orderId) as OrderRow | undefined;
  if (!order || order.user_id !== userId) throw new UserError("Order not found");
  if (order.status !== "open") throw new UserError("Order is no longer open");
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(orderId);
  addBalance.run(order.price * order.remaining, userId);
});

export const resolveMarket = db.transaction(
  (marketId: number, outcome: "YES" | "NO" | "VOID") => {
    const market = db
      .prepare("SELECT status FROM markets WHERE id = ?")
      .get(marketId) as { status: string } | undefined;
    if (!market) throw new UserError("Market not found");
    if (market.status !== "open") throw new UserError("Market already resolved");

    // Cancel all open orders and refund the reserved funds.
    const openOrders = db
      .prepare(
        "SELECT id, user_id, price, remaining FROM orders WHERE market_id = ? AND status = 'open'"
      )
      .all(marketId) as Pick<OrderRow, "id" | "user_id" | "price" | "remaining">[];
    for (const order of openOrders) {
      db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);
      addBalance.run(order.price * order.remaining, order.user_id);
    }

    // Pay out positions. VOID refunds 50c per share to each side, which
    // returns exactly the 100c escrowed per minted pair.
    const positions = db
      .prepare(
        "SELECT user_id, yes_shares, no_shares FROM positions WHERE market_id = ?"
      )
      .all(marketId) as { user_id: number; yes_shares: number; no_shares: number }[];
    for (const pos of positions) {
      let payout = 0;
      if (outcome === "YES") payout = pos.yes_shares * 100;
      else if (outcome === "NO") payout = pos.no_shares * 100;
      else payout = (pos.yes_shares + pos.no_shares) * 50;
      if (payout > 0) addBalance.run(payout, pos.user_id);
    }

    db.prepare(
      "UPDATE markets SET status = 'resolved', outcome = ?, resolved_at = datetime('now') WHERE id = ?"
    ).run(outcome, marketId);
  }
);

export function userBalance(userId: number): number {
  const row = getBalance.get(userId) as { balance: number } | undefined;
  return row?.balance ?? 0;
}
