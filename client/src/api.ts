export interface User {
  id: number;
  username: string;
  balance: number;
  isAdmin: boolean;
}

export interface MarketSummary {
  id: number;
  title: string;
  description: string;
  status: "open" | "resolved";
  outcome: "YES" | "NO" | "VOID" | null;
  creator: string;
  created_at: string;
  volume: number;
  lastPrice: number | null;
}

export interface BookLevel {
  price: number;
  quantity: number;
}

export interface Trade {
  price: number;
  quantity: number;
  taker_side: "YES" | "NO";
  created_at: string;
  yes_user: string;
  no_user: string;
}

export interface OpenOrder {
  id: number;
  side: "YES" | "NO";
  price: number;
  quantity: number;
  remaining: number;
  created_at: string;
}

export interface MarketDetail {
  market: MarketSummary & { resolved_at: string | null };
  lastPrice: number | null;
  yesBids: BookLevel[];
  noBids: BookLevel[];
  trades: Trade[];
  position: { yes_shares: number; no_shares: number };
  myOrders: OpenOrder[];
  balance: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LeaderboardRow {
  id: number;
  username: string;
  isAdmin: boolean;
  balance: number;
  netWorth: number;
}

const TOKEN_KEY = "pred_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const cents = (amount: number) =>
  `$${(amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
