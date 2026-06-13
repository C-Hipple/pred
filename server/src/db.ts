import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH || "data/pred.db";
fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  balance       INTEGER NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS markets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  creator_id  INTEGER NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  outcome     TEXT CHECK (outcome IN ('YES','NO','VOID')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id  INTEGER NOT NULL REFERENCES markets(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  side       TEXT NOT NULL CHECK (side IN ('YES','NO')),
  price      INTEGER NOT NULL CHECK (price BETWEEN 1 AND 99),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  remaining  INTEGER NOT NULL CHECK (remaining >= 0),
  status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','filled','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_book ON orders (market_id, side, status, price);

CREATE TABLE IF NOT EXISTS positions (
  market_id  INTEGER NOT NULL REFERENCES markets(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  yes_shares INTEGER NOT NULL DEFAULT 0,
  no_shares  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (market_id, user_id)
);

CREATE TABLE IF NOT EXISTS trades (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  market_id   INTEGER NOT NULL REFERENCES markets(id),
  yes_user_id INTEGER NOT NULL REFERENCES users(id),
  no_user_id  INTEGER NOT NULL REFERENCES users(id),
  price       INTEGER NOT NULL,
  quantity    INTEGER NOT NULL,
  taker_side  TEXT NOT NULL CHECK (taker_side IN ('YES','NO')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_trades_market ON trades (market_id, id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS market_tags (
  market_id INTEGER NOT NULL REFERENCES markets(id),
  tag_id    INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (market_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_market_tags_tag ON market_tags (tag_id, market_id);
`);

function getOrCreateMeta(key: string, create: () => string): string {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  if (row) return row.value;
  const value = create();
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)").run(key, value);
  return value;
}

// Persist a generated JWT secret so sessions survive server restarts.
export const JWT_SECRET =
  process.env.JWT_SECRET ||
  getOrCreateMeta("jwt_secret", () => crypto.randomBytes(32).toString("hex"));

// All money amounts are integer cents. Every user starts with $1000.
export const STARTING_BALANCE = 100_000;
