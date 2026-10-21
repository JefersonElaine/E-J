import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { nowIso } from "./db.js";
import { isEmail, sanitizeText, validatePassword } from "./validate.js";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;

export function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

export function newId() {
  return crypto.randomUUID();
}

export function timingSafeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  if (left.length === 0) return true;
  return crypto.timingSafeEqual(left, right);
}

export async function countRecentFails(db, email, ip) {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const rows = await db.all(
    "SELECT success FROM login_attempts WHERE (email = ? OR ip = ?) AND created_at >= ?",
    [email, ip, since]
  );
  return rows.filter((r) => Number(r.success) === 0).length;
}

export async function recordAttempt(db, email, ip, success) {
  await db.run("INSERT INTO login_attempts (id, email, ip, success, created_at) VALUES (?, ?, ?, ?, ?)", [
    newId(),
    email,
    ip,
    success ? 1 : 0,
    nowIso(),
  ]);
}

export async function createSession(db, adminId) {
  const id = newId();
  const expires = new Date(Date.now() + config.sessionTtlMs).toISOString();
  await db.run("INSERT INTO sessions (id, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)", [
    id,
    adminId,
    expires,
    nowIso(),
  ]);
  return { id, expires };
}

export async function destroySession(db, sessionId) {
  if (!sessionId) return;
  await db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
}

export async function getSessionAdmin(db, sessionId) {
  if (!sessionId) return null;
  const session = await db.get("SELECT * FROM sessions WHERE id = ?", [sessionId]);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.run("DELETE FROM sessions WHERE id = ?", [sessionId]);
    return null;
  }
  return db.get("SELECT id, email, created_at FROM admins WHERE id = ?", [session.admin_id]);
}

export function setSessionCookie(res, sessionId) {
  const secure = config.nodeEnv === "production";
  res.cookie(config.cookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: config.sessionTtlMs,
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { path: "/" });
}

export function readClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "0.0.0.0";
}

export function parseCredentials(body) {
  const email = sanitizeText(String(body?.email || "").toLowerCase(), 160);
  const password = String(body?.password || "");
  if (!isEmail(email)) return { error: "Informe um e-mail valido." };
  const pwdError = validatePassword(password);
  if (pwdError) return { error: pwdError };
  return { email, password };
}

export { isEmail, validatePassword };
