import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, cents } from "../api";
import { useAuth } from "../auth";

interface PortfolioOrder {
  id: number;
  market_id: number;
  market_title: string;
  side: "YES" | "NO";
  price: number;
  quantity: number;
  remaining: number;
  created_at: string;
}

interface PortfolioPosition {
  market_id: number;
  market_title: string;
  yes_shares: number;
  no_shares: number;
  lastPrice: number | null;
  value: number;
}

interface Portfolio {
  balance: number;
  orders: PortfolioOrder[];
  positions: PortfolioPosition[];
}

export default function PortfolioPage() {
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState("");
  const { refresh } = useAuth();

  const load = useCallback(() => {
    api<Portfolio>("/portfolio").then(setData, (err) =>
      setError(err instanceof Error ? err.message : "Failed to load portfolio")
    );
  }, []);

  useEffect(load, [load]);

  async function cancelOrder(orderId: number) {
    try {
      await api(`/orders/${orderId}`, { method: "DELETE" });
      load();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  if (!data) return <div className="center muted">{error || "Loading…"}</div>;

  const reserved = data.orders.reduce((sum, o) => sum + o.price * o.remaining, 0);
  const positionsValue = data.positions.reduce((sum, p) => sum + p.value, 0);

  return (
    <div className="stack-lg">
      <h2>Your portfolio</h2>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="position-row">
          <span>
            Cash: <strong>{cents(data.balance)}</strong>
          </span>
          <span className="muted">
            In open orders: <strong>{cents(reserved)}</strong>
          </span>
          <span className="muted">
            Positions (mark-to-market): <strong>{cents(positionsValue)}</strong>
          </span>
          <span>
            Net worth:{" "}
            <strong className="yes-text">
              {cents(data.balance + reserved + positionsValue)}
            </strong>
          </span>
        </div>
      </div>

      <div className="card">
        <h3>Positions</h3>
        {data.positions.length === 0 && (
          <div className="muted small">
            No open positions. <Link to="/">Find a market</Link> to bet on.
          </div>
        )}
        {data.positions.map((p) => (
          <div key={p.market_id} className="order-row wrap">
            <Link to={`/market/${p.market_id}`} className="grow">
              {p.market_title}
            </Link>
            {p.yes_shares > 0 && (
              <span className="badge yes">YES {p.yes_shares}</span>
            )}
            {p.no_shares > 0 && <span className="badge no">NO {p.no_shares}</span>}
            <span className="muted small">
              last {p.lastPrice === null ? "—" : `${p.lastPrice}¢`} · worth ≈{" "}
              {cents(p.value)}
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Open orders</h3>
        {data.orders.length === 0 && (
          <div className="muted small">No open orders.</div>
        )}
        {data.orders.map((o) => (
          <div key={o.id} className="order-row wrap">
            <Link to={`/market/${o.market_id}`} className="grow">
              {o.market_title}
            </Link>
            <span className={o.side === "YES" ? "yes-text" : "no-text"}>
              {o.side}
            </span>
            <span>
              {o.remaining}/{o.quantity} @ {o.price}¢
            </span>
            <span className="muted small">{cents(o.price * o.remaining)} held</span>
            <button className="link-btn" onClick={() => cancelOrder(o.id)}>
              Cancel
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
