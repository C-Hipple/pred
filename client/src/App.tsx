import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./auth";
import { cents } from "./api";
import LoginPage from "./pages/Login";
import MarketsPage from "./pages/Markets";
import MarketDetailPage from "./pages/MarketDetail";
import LeaderboardPage from "./pages/Leaderboard";

function Header() {
  const { user, logout } = useAuth();
  return (
    <header className="header">
      <Link to="/" className="logo">
        pred<span className="logo-dot">.</span>
      </Link>
      {user && (
        <nav className="nav">
          <Link to="/">Markets</Link>
          <Link to="/leaderboard">Leaderboard</Link>
          <span className="balance" title="Cash balance">
            {cents(user.balance)}
          </span>
          <button className="link-btn" onClick={logout}>
            Log out ({user.username})
          </button>
        </nav>
      )}
    </header>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="page center muted">Loading…</div>;
  }

  return (
    <div className="app">
      <Header />
      <main className="page">
        <Routes>
          {user ? (
            <>
              <Route path="/" element={<MarketsPage />} />
              <Route path="/market/:id" element={<MarketDetailPage />} />
              <Route path="/leaderboard" element={<LeaderboardPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="*"
                element={<Navigate to="/login" replace state={{ from: location }} />}
              />
            </>
          )}
        </Routes>
      </main>
    </div>
  );
}
