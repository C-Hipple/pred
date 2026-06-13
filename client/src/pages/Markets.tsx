import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type MarketSummary, type TagWithCount } from "../api";

function MarketCard({ market }: { market: MarketSummary }) {
  const price = market.lastPrice;
  const resolvedClass =
    market.outcome === "YES" ? "yes" : market.outcome === "NO" ? "no" : "";
  return (
    <Link to={`/market/${market.id}`} className="card market-card">
      <div className="market-card-main">
        <h3>{market.title}</h3>
        <div className="muted small">
          by {market.creator} · {market.volume} shares traded
        </div>
        {market.tags.length > 0 && (
          <div className="tag-list">
            {market.tags.map((tag) => (
              <span key={tag.id} className="tag-chip">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="market-card-price">
        {market.status === "resolved" ? (
          <span className={`badge ${resolvedClass}`}>{market.outcome}</span>
        ) : (
          <>
            <span className="price-big">{price === null ? "—" : `${price}¢`}</span>
            <span className="muted small">YES</span>
          </>
        )}
      </div>
    </Link>
  );
}

export default function MarketsPage() {
  const [markets, setMarkets] = useState<MarketSummary[]>([]);
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api<{ markets: MarketSummary[] }>("/markets").then(
      (data) => setMarkets(data.markets),
      () => {}
    );
    api<{ tags: TagWithCount[] }>("/tags").then(
      (data) => setTags(data.tags),
      () => {}
    );
  }, []);

  function toggleTag(id: number) {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  }

  // A market matches when it carries every selected tag (AND filter).
  const filtered = useMemo(() => {
    if (selectedTags.length === 0) return markets;
    return markets.filter((m) => {
      const ids = new Set(m.tags.map((t) => t.id));
      return selectedTags.every((id) => ids.has(id));
    });
  }, [markets, selectedTags]);

  async function createMarket(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await api<{ id: number }>("/markets", {
        method: "POST",
        body: { title, description },
      });
      navigate(`/market/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  const open = filtered.filter((m) => m.status === "open");
  const resolved = filtered.filter((m) => m.status === "resolved");

  return (
    <div className="stack-lg">
      <div className="row-between">
        <h2>Markets</h2>
        <button className="btn primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ New market"}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createMarket} className="card stack">
          <input
            placeholder='Question, e.g. "Will Sam run the marathon this year?"'
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <textarea
            placeholder="Resolution criteria / details (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
          {error && <div className="error">{error}</div>}
          <button className="btn primary">Create market</button>
        </form>
      )}

      {tags.length > 0 && (
        <div className="tag-filter">
          <div className="row-between wrap">
            <span className="muted small">Filter by tag</span>
            {selectedTags.length > 0 && (
              <button className="link-btn" onClick={() => setSelectedTags([])}>
                Clear ({selectedTags.length})
              </button>
            )}
          </div>
          <div className="tag-list">
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={
                  selectedTags.includes(tag.id)
                    ? "tag-chip selectable active"
                    : "tag-chip selectable"
                }
                onClick={() => toggleTag(tag.id)}
              >
                {tag.name} <span className="muted">{tag.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {open.length === 0 && !showCreate && (
        <div className="card center muted">
          {selectedTags.length > 0
            ? "No markets match the selected tags."
            : "No open markets yet. Create the first one!"}
        </div>
      )}
      <div className="stack">
        {open.map((m) => (
          <MarketCard key={m.id} market={m} />
        ))}
      </div>

      {resolved.length > 0 && (
        <>
          <h3 className="muted">Resolved</h3>
          <div className="stack">
            {resolved.map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
