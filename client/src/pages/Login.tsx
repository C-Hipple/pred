import { useEffect, useState, type FormEvent } from "react";
import { api, type User } from "../api";
import { useAuth } from "../auth";

export default function LoginPage() {
  const { loginWith } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteRequired, setInviteRequired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ inviteRequired: boolean }>("/auth/config").then(
      (config) => setInviteRequired(config.inviteRequired),
      () => {}
    );
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = await api<{ token: string; user: User }>(`/auth/${mode}`, {
        method: "POST",
        body:
          mode === "register"
            ? { username, password, inviteCode }
            : { username, password },
      });
      loginWith(data.token, data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-card card">
      <h1>
        pred<span className="logo-dot">.</span>
      </h1>
      <p className="muted">
        A prediction market for your group of friends. New accounts start with
        $1,000 of play money.
      </p>
      <div className="tabs">
        <button
          className={mode === "login" ? "tab active" : "tab"}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          className={mode === "register" ? "tab active" : "tab"}
          onClick={() => setMode("register")}
        >
          Sign up
        </button>
      </div>
      <form onSubmit={submit} className="stack">
        <input
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
        {mode === "register" && inviteRequired && (
          <input
            placeholder="Invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
          />
        )}
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
