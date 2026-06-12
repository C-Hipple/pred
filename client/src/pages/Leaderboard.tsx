import { useEffect, useState } from "react";
import { api, cents, type LeaderboardRow } from "../api";
import { useAuth } from "../auth";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const { user } = useAuth();

  useEffect(() => {
    api<{ leaderboard: LeaderboardRow[] }>("/leaderboard").then(
      (data) => setRows(data.leaderboard),
      () => {}
    );
  }, []);

  return (
    <div className="stack-lg">
      <h2>Leaderboard</h2>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th className="num">Net worth</th>
              <th className="num">Cash</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className={row.id === user?.id ? "me" : ""}>
                <td>{i + 1}</td>
                <td>
                  {row.username}
                  {row.isAdmin && <span className="badge small-badge">admin</span>}
                </td>
                <td className="num">{cents(row.netWorth)}</td>
                <td className="num muted">{cents(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted small">
          Net worth = cash + open orders + positions marked at the last traded
          price.
        </div>
      </div>
    </div>
  );
}
