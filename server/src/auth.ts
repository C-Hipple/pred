import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { db, JWT_SECRET, STARTING_BALANCE } from "./db.js";

export interface AuthUser {
  id: number;
  username: string;
  balance: number;
  is_admin: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

export function register(username: string, password: string): AuthUser {
  username = (username || "").trim();
  if (!/^[a-zA-Z0-9_-]{2,24}$/.test(username)) {
    throw new Error(
      "Username must be 2-24 characters (letters, numbers, - and _)"
    );
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
  const existing = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);
  if (existing) throw new Error("Username is taken");

  // The first user to register becomes the admin.
  const userCount = (
    db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }
  ).n;
  const hash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      "INSERT INTO users (username, password_hash, balance, is_admin) VALUES (?, ?, ?, ?)"
    )
    .run(username, hash, STARTING_BALANCE, userCount === 0 ? 1 : 0);
  return getUser(Number(result.lastInsertRowid))!;
}

export function login(username: string, password: string): AuthUser {
  const row = db
    .prepare("SELECT * FROM users WHERE username = ?")
    .get((username || "").trim()) as
    | (AuthUser & { password_hash: string })
    | undefined;
  if (!row || !bcrypt.compareSync(password || "", row.password_hash)) {
    throw new Error("Invalid username or password");
  }
  return { id: row.id, username: row.username, balance: row.balance, is_admin: row.is_admin };
}

export function getUser(id: number): AuthUser | undefined {
  return db
    .prepare("SELECT id, username, balance, is_admin FROM users WHERE id = ?")
    .get(id) as AuthUser | undefined;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const user = getUser(payload.userId);
    if (!user) return res.status(401).json({ error: "Account not found" });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Session expired, please log in again" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.is_admin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

export function publicUser(user: AuthUser) {
  return {
    id: user.id,
    username: user.username,
    balance: user.balance,
    isAdmin: !!user.is_admin,
  };
}
