import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, cents, type Candle, type MarketDetail } from "../api";
import { useAuth } from "../auth";
import CandleChart from "../components/CandleChart";

const INTERVALS = [
  { key: "5m", label: "5m", seconds: 300 },
  { key: "1h", label: "1h", seconds: 3600 },
  { key: "6h", label: "6h", seconds: 21600 },
  { key: "1d", label: "1d", seconds: 86400 },
] as const;

export default function MarketDetailPage() {
  const { id } = useParams();
  const { user, refresh } = useAuth();
  const [data, setData] = useState<MarketDetail | null>(null);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [candles, setCandles] = useState<Candle[]>([]);
  const [intervalKey, setIntervalKey] = useState<(typeof INTERVALS)[number]["key"]>("1h");

  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [price, setPrice] = useState("50");
  const [quantity, setQuantity] = useState("10");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        api<MarketDetail>(`/markets/${id}`),
        api<{ candles: Candle[] }>(`/markets/${id}/candles?interval=${intervalKey}`),
      ]);
      setData(d);
      setCandles(c.candles);
    } catch (err) {
      if (err instanceof Error && err.message.includes("not found")) {
        setNotFound(true);
      }
    }
  }, [id, intervalKey]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), refresh()]);
  }, [load, refresh]);

  // The book from the YES perspective: asks come from resting NO buys.
  const { bids, asks } = useMemo(() => {
    if (!data) return { bids: [], asks: [] };
    const bids = data.yesBids; // already sorted price DESC
    const asks = data.noBids
      .map((level) => ({ price: 100 - level.price, quantity: level.quantity }))
      .sort((a, b) => a.price - b.price);
    return { bids, asks };
  }, [data]);

  // Clicking a book level prefills the order form to take that liquidity.
  // Taking an ask (a resting NO buy) means buying YES at the ask price.
  // Taking a bid (a resting YES buy) means buying NO at 100 - the bid price.
  const takeLevel = useCallback(
    (book: "bid" | "ask", levelPrice: number, levelQty: number) => {
      if (book === "ask") {
        setSide("YES");
        setPrice(String(levelPrice));
      } else {
        setSide("NO");
        setPrice(String(100 - levelPrice));
      }
      setQuantity(String(levelQty));
      setFormError("");
      setNotice("");
    },
    []
  );

  if (notFound) return <div className="card center muted">Market not found.</div>;
  if (!data) return <div className="center muted">Loading…</div>;

  const { market } = data;
  const isOpen = market.status === "open";
  const priceNum = Number(price);
  const quantityNum = Number(quantity);
  const orderCost =
    Number.isInteger(priceNum) && Number.isInteger(quantityNum) && quantityNum > 0
      ? priceNum * quantityNum
      : null;
  const probability =
    data.lastPrice ??
    (bids.length && asks.length
      ? Math.round((bids[0].price + asks[0].price) / 2)
      : null);

  async function placeOrder(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setNotice("");
    try {
      const result = await api<{ filled: number; remaining: number }>(
        `/markets/${id}/orders`,
        { method: "POST", body: { side, price: priceNum, quantity: quantityNum } }
      );
      setNotice(
        result.filled > 0
          ? `Filled ${result.filled} share${result.filled === 1 ? "" : "s"}` +
              (result.remaining > 0
                ? `, ${result.remaining} resting on the book`
                : "")
          : "Order placed on the book"
      );
      await refreshAll();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function cancelOrder(orderId: number) {
    try {
      await api(`/orders/${orderId}`, { method: "DELETE" });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  async function resolve(outcome: "YES" | "NO" | "VOID") {
    const label =
      outcome === "VOID" ? "void this market (refunds everyone)" : `resolve ${outcome}`;
    if (!window.confirm(`Really ${label}? This cannot be undone.`)) return;
    try {
      await api(`/markets/${id}/resolve`, { method: "POST", body: { outcome } });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <div className="stack-lg">
      <div className="card">
        <div className="row-between wrap">
          <div>
            <h2>{market.title}</h2>
            <div className="muted small">
              created by {market.creator}
              {market.status === "resolved" && market.resolved_at
                ? ` · resolved ${market.resolved_at} UTC`
                : ""}
            </div>
          </div>
          <div className="prob">
            {market.status === "resolved" ? (
              <span
                className={`badge big ${
                  market.outcome === "YES" ? "yes" : market.outcome === "NO" ? "no" : ""
                }`}
              >
                {market.outcome}
              </span>
            ) : (
              <>
                <span className="price-big">
                  {probability === null ? "—" : `${probability}%`}
                </span>
                <span className="muted small">chance</span>
              </>
            )}
          </div>
        </div>
        {market.description && <p className="description">{market.description}</p>}
        {error && <div className="error">{error}</div>}
        {user?.isAdmin && isOpen && (
          <div className="admin-row">
            <span className="muted small">Admin — resolve:</span>
            <button className="btn yes small" onClick={() => resolve("YES")}>
              YES
            </button>
            <button className="btn no small" onClick={() => resolve("NO")}>
              NO
            </button>
            <button className="btn small" onClick={() => resolve("VOID")}>
              Void
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="row-between wrap">
          <h3>Price history (YES)</h3>
          <div className="tabs interval-tabs">
            {INTERVALS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={intervalKey === option.key ? "tab active" : "tab"}
                onClick={() => setIntervalKey(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <CandleChart
          candles={candles}
          interval={INTERVALS.find((o) => o.key === intervalKey)!.seconds}
        />
      </div>

      <div className="market-grid">
        {isOpen && (
          <form onSubmit={placeOrder} className="card stack">
            <h3>Place order</h3>
            <div className="tabs">
              <button
                type="button"
                className={side === "YES" ? "tab active yes" : "tab"}
                onClick={() => setSide("YES")}
              >
                Buy YES
              </button>
              <button
                type="button"
                className={side === "NO" ? "tab active no" : "tab"}
                onClick={() => setSide("NO")}
              >
                Buy NO
              </button>
            </div>
            <label>
              Limit price (¢ per {side} share, pays 100¢ if {side})
              <input
                type="number"
                min={1}
                max={99}
                step={1}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
            <label>
              Quantity (shares)
              <input
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </label>
            <div className="muted small">
              Max cost: {orderCost === null ? "—" : cents(orderCost)} · Payout if{" "}
              {side}: {orderCost === null ? "—" : cents(quantityNum * 100)}
            </div>
            {formError && <div className="error">{formError}</div>}
            {notice && <div className="notice">{notice}</div>}
            <button className={`btn primary ${side === "YES" ? "yes" : "no"}`}>
              Buy {side}
            </button>
            <div className="muted small">
              To exit a position, buy the opposite side — matched YES+NO pairs
              redeem for 100¢ automatically.
            </div>
          </form>
        )}

        <div className="card">
          <h3>Order book (YES)</h3>
          {isOpen && (bids.length > 0 || asks.length > 0) && (
            <div className="book-hint small">
              💡 Click any order below to take the other side of it — it prefills
              the form so you can buy instantly.
            </div>
          )}
          <div className="book">
            <div className="book-side">
              <div className="book-header muted small">
                <span>Bid</span>
                <span>Qty</span>
              </div>
              {bids.length === 0 && <div className="muted small">No bids</div>}
              {bids.map((level) => (
                <button
                  key={level.price}
                  type="button"
                  className="book-row yes-text"
                  disabled={!isOpen}
                  onClick={() => takeLevel("bid", level.price, level.quantity)}
                  title={`Sell into this bid — buy NO at ${100 - level.price}¢`}
                >
                  <span>{level.price}¢</span>
                  <span>{level.quantity}</span>
                </button>
              ))}
            </div>
            <div className="book-side">
              <div className="book-header muted small">
                <span>Ask</span>
                <span>Qty</span>
              </div>
              {asks.length === 0 && <div className="muted small">No asks</div>}
              {asks.map((level) => (
                <button
                  key={level.price}
                  type="button"
                  className="book-row no-text"
                  disabled={!isOpen}
                  onClick={() => takeLevel("ask", level.price, level.quantity)}
                  title={`Take this ask — buy YES at ${level.price}¢`}
                >
                  <span>{level.price}¢</span>
                  <span>{level.quantity}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="muted small book-note">
            Click any level to prefill the order form. Take an ask to buy YES;
            hit a bid to sell (buy NO at 100¢ − bid) — both trade instantly.
          </div>
        </div>

        <div className="card">
          <h3>Your position</h3>
          {!isOpen && (
            <div className="muted small" style={{ marginBottom: 8 }}>
              {market.outcome === "VOID"
                ? "Market voided — all shares were refunded at 50¢."
                : `Market resolved ${market.outcome} — winning shares were paid out at $1.00 each.`}
            </div>
          )}
          <div className="position-row">
            <span className="badge yes">YES {data.position.yes_shares}</span>
            <span className="badge no">NO {data.position.no_shares}</span>
            <span className="muted small">Cash: {cents(data.balance)}</span>
          </div>
          {data.myOrders.length > 0 && (
            <>
              <h4 className="muted">Your open orders</h4>
              {data.myOrders.map((order) => (
                <div key={order.id} className="order-row">
                  <span className={order.side === "YES" ? "yes-text" : "no-text"}>
                    {order.side}
                  </span>
                  <span>
                    {order.remaining}/{order.quantity} @ {order.price}¢
                  </span>
                  {isOpen && (
                    <button className="link-btn" onClick={() => cancelOrder(order.id)}>
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <h3>Recent trades</h3>
          {data.trades.length === 0 && <div className="muted small">No trades yet</div>}
          {data.trades.map((trade, i) => (
            <div key={i} className="trade-row small">
              <span className={trade.taker_side === "YES" ? "yes-text" : "no-text"}>
                {trade.price}¢
              </span>
              <span>×{trade.quantity}</span>
              <span className="muted">
                {trade.yes_user} (YES) vs {trade.no_user} (NO)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
