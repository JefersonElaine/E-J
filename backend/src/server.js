import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import QRCode from "qrcode";
import { config, ensureDirs, assertSecrets } from "./config.js";
import { initDb, nowIso } from "./db.js";
import { createStorage } from "./storage.js";
import {
  checksum,
  detectMime,
  kindFromMime,
  maxBytesFor,
  readMp4Duration,
  safeFileName,
  sanitizeText,
} from "./validate.js";
import {
  clearSessionCookie,
  countRecentFails,
  createSession,
  destroySession,
  getSessionAdmin,
  hashPassword,
  newId,
  parseCredentials,
  readClientIp,
  recordAttempt,
  setSessionCookie,
  timingSafeEqual,
  verifyPassword,
} from "./auth.js";
import { rateLimit } from "./rateLimit.js";

ensureDirs();
assertSecrets();

const storage = createStorage();
const db = await initDb();
const app = express();
const frontendDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.max(config.limits.photoMb, config.limits.videoMb) * 1024 * 1024, files: config.limits.filesPerUpload },
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");
  next();
});

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const requireAdmin = asyncHandler(async (req, res, next) => {
  const admin = await getSessionAdmin(db, req.cookies[config.cookieName]);
  if (!admin) return res.status(401).json({ error: "Sessao expirada. Entre novamente." });
  req.admin = admin;
  next();
});

function publicMedia(row) {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    guestName: row.guest_name || "",
    caption: row.caption || "",
    createdAt: row.created_at,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationSec: row.duration_sec,
  };
}

function adminMedia(row) {
  return {
    ...publicMedia(row),
    status: row.status,
    originalName: row.original_name,
    rejectReason: row.reject_reason || "",
    reviewedAt: row.reviewed_at,
  };
}

app.get("/api/health", asyncHandler(async (_req, res) => {
  await db.get("SELECT 1 as ok");
  res.json({ ok: true, storage: config.storageDriver });
}));

app.get("/api/site", asyncHandler(async (_req, res) => {
  const adminCount = await db.get("SELECT COUNT(*) as c FROM admins");
  const approved = await db.get("SELECT COUNT(*) as c FROM media WHERE status = ?", ["approved"]);
  res.json({
    couple: "Elaine & Jeferson",
    date: "2026-11-27",
    dateLabel: "27 de novembro de 2026",
    tagline: "Um dia especial, milhares de lembrancas. Compartilhe a sua.",
    setupRequired: Number(adminCount?.c || 0) === 0,
    approvedCount: Number(approved?.c || 0),
    limits: {
      photoMb: config.limits.photoMb,
      videoMb: config.limits.videoMb,
      filesPerUpload: config.limits.filesPerUpload,
      maxVideoSeconds: config.limits.maxVideoSeconds,
    },
  });
}));

app.get("/api/qr", asyncHandler(async (_req, res) => {
  const url = config.publicUrl;
  const png = await QRCode.toBuffer(url, { margin: 1, width: 512, color: { dark: "#3d2a24", light: "#f7f1e8" } });
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(png);
}));

app.post(
  "/api/setup",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 8, keyFn: (req) => `setup:${readClientIp(req)}` }),
  asyncHandler(async (req, res) => {
    const existing = await db.get("SELECT id FROM admins LIMIT 1");
    if (existing) return res.status(409).json({ error: "A conta administrativa ja foi criada." });
    if (!timingSafeEqual(req.body?.setupToken, config.setupToken)) {
      return res.status(403).json({ error: "Token de configuracao invalido." });
    }
    const parsed = parseCredentials(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const id = newId();
    const now = nowIso();
    await db.run(
      "INSERT INTO admins (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [id, parsed.email, hashPassword(parsed.password), now, now]
    );
    const session = await createSession(db, id);
    setSessionCookie(res, session.id);
    res.json({ ok: true, email: parsed.email });
  })
);

app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyFn: (req) => `login:${readClientIp(req)}` }),
  asyncHandler(async (req, res) => {
    const email = sanitizeText(String(req.body?.email || "").toLowerCase(), 160);
    const password = String(req.body?.password || "");
    const ip = readClientIp(req);
    const fails = await countRecentFails(db, email, ip);
    if (fails >= 8) return res.status(429).json({ error: "Muitas tentativas de login. Aguarde 15 minutos." });
    const admin = await db.get("SELECT * FROM admins WHERE email = ?", [email]);
    const ok = admin && verifyPassword(password, admin.password_hash);
    await recordAttempt(db, email || "unknown", ip, Boolean(ok));
    if (!ok) return res.status(401).json({ error: "E-mail ou senha incorretos." });
    const session = await createSession(db, admin.id);
    setSessionCookie(res, session.id);
    res.json({ ok: true, email: admin.email });
  })
);

app.post("/api/auth/logout", asyncHandler(async (req, res) => {
  await destroySession(db, req.cookies[config.cookieName]);
  clearSessionCookie(res);
  res.json({ ok: true });
}));

app.get("/api/auth/me", asyncHandler(async (req, res) => {
  const admin = await getSessionAdmin(db, req.cookies[config.cookieName]);
  if (!admin) return res.status(401).json({ error: "Nao autenticado." });
  res.json({ email: admin.email });
}));

app.post(
  "/api/auth/recover",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 6, keyFn: (req) => `recover:${readClientIp(req)}` }),
  asyncHandler(async (req, res) => {
    if (!timingSafeEqual(req.body?.setupToken, config.setupToken)) {
      return res.status(403).json({ error: "Token de recuperacao invalido." });
    }
    const parsed = parseCredentials(req.body);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const admin = await db.get("SELECT * FROM admins WHERE email = ?", [parsed.email]);
    if (!admin) return res.status(404).json({ error: "Nao existe administrador com este e-mail." });
    await db.run("UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?", [
      hashPassword(parsed.password),
      nowIso(),
      admin.id,
    ]);
    await db.run("DELETE FROM sessions WHERE admin_id = ?", [admin.id]);
    res.json({ ok: true });
  })
);

app.post(
  "/api/auth/password",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const current = String(req.body?.currentPassword || "");
    const next = String(req.body?.newPassword || "");
    const admin = await db.get("SELECT * FROM admins WHERE id = ?", [req.admin.id]);
    if (!verifyPassword(current, admin.password_hash)) {
      return res.status(400).json({ error: "Senha atual incorreta." });
    }
    const parsed = parseCredentials({ email: admin.email, password: next });
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    await db.run("UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = ?", [
      hashPassword(next),
      nowIso(),
      admin.id,
    ]);
    res.json({ ok: true });
  })
);

app.post(
  "/api/uploads",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, keyFn: (req) => `up:${readClientIp(req)}` }),
  upload.array("files", config.limits.filesPerUpload),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: "Selecione ao menos um arquivo." });
    if (files.length > config.limits.filesPerUpload) {
      return res.status(400).json({ error: `Envie no maximo ${config.limits.filesPerUpload} arquivos por vez.` });
    }
    const guestName = sanitizeText(req.body?.guestName, config.limits.guestName);
    const caption = sanitizeText(req.body?.caption, config.limits.caption);
    const accepted = [];
    const rejected = [];

    for (const file of files) {
      const mime = detectMime(file.buffer, file.mimetype);
      const kind = kindFromMime(mime);
      if (!kind) {
        rejected.push({ name: file.originalname, error: "Formato nao permitido. Use JPG, PNG, WEBP, MP4 ou MOV." });
        continue;
      }
      if (file.size > maxBytesFor(kind)) {
        rejected.push({
          name: file.originalname,
          error: kind === "photo"
            ? `Foto acima de ${config.limits.photoMb} MB.`
            : `Video acima de ${config.limits.videoMb} MB.`,
        });
        continue;
      }
      let duration = null;
      if (kind === "video" && (mime === "video/mp4" || mime === "video/quicktime")) {
        duration = readMp4Duration(file.buffer);
        if (duration && duration > config.limits.maxVideoSeconds) {
          rejected.push({ name: file.originalname, error: `Video acima de ${config.limits.maxVideoSeconds} segundos.` });
          continue;
        }
      }
      const hash = checksum(file.buffer);
      const dup = await db.get("SELECT id, status FROM media WHERE checksum = ?", [hash]);
      if (dup) {
        rejected.push({ name: file.originalname, error: "Este arquivo ja foi enviado." });
        continue;
      }
      const id = newId();
      const ext =
        kind === "photo"
          ? mime === "image/png"
            ? "png"
            : mime === "image/webp"
              ? "webp"
              : mime === "image/heic" || mime === "image/heif"
                ? "heic"
                : "jpg"
          : mime === "video/webm"
            ? "webm"
            : mime === "video/quicktime"
              ? "mov"
              : "mp4";
      const key = `pending/${id}.${ext}`;
      await storage.put(key, file.buffer, mime);
      await db.run(
        `INSERT INTO media (id, status, kind, mime, original_name, storage_key, size_bytes, duration_sec, checksum, guest_name, caption, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, "pending", kind, mime, safeFileName(file.originalname), key, file.size, duration, hash, guestName || null, caption || null, nowIso()]
      );
      await db.run("INSERT INTO audit_log (id, action, media_id, detail, created_at) VALUES (?, ?, ?, ?, ?)", [
        newId(),
        "upload",
        id,
        guestName || "anonimo",
        nowIso(),
      ]);
      accepted.push({ id, kind, originalName: safeFileName(file.originalname) });
    }

    res.status(accepted.length ? 201 : 400).json({
      accepted,
      rejected,
      message: accepted.length
        ? "Recebemos suas lembrancas. Elas aparecem na galeria depois da aprovacao."
        : "Nenhum arquivo foi aceito.",
    });
  })
);

app.get("/api/gallery", asyncHandler(async (req, res) => {
  const type = ["photo", "video"].includes(req.query.type) ? req.query.type : "";
  const q = sanitizeText(req.query.q, 80).toLowerCase();
  const day = sanitizeText(req.query.date, 12);
  const sort = req.query.sort === "oldest" ? "ASC" : "DESC";
  const cursor = sanitizeText(req.query.cursor, 80);
  const limit = Math.min(Number(req.query.limit) || 24, 48);

  let sql = "SELECT * FROM media WHERE status = ?";
  const params = ["approved"];
  if (type) {
    sql += " AND kind = ?";
    params.push(type);
  }
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    sql += " AND created_at LIKE ?";
    params.push(`${day}%`);
  }
  if (q) {
    sql += " AND (LOWER(COALESCE(guest_name,'')) LIKE ? OR LOWER(COALESCE(caption,'')) LIKE ?)";
    params.push(`%${q}%`, `%${q}%`);
  }
  if (cursor) {
    sql += sort === "DESC" ? " AND created_at < ?" : " AND created_at > ?";
    params.push(cursor);
  }
  sql += ` ORDER BY created_at ${sort} LIMIT ?`;
  params.push(limit + 1);
  const rows = await db.all(sql, params);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(publicMedia);
  res.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].createdAt : null,
  });
}));

app.get("/api/media/:id/file", asyncHandler(async (req, res) => {
  const row = await db.get("SELECT * FROM media WHERE id = ?", [req.params.id]);
  if (!row || row.status !== "approved") return res.status(404).json({ error: "Arquivo nao encontrado." });
  return streamFile(row, req, res, false);
}));

app.get("/api/media/:id/download", asyncHandler(async (req, res) => {
  const row = await db.get("SELECT * FROM media WHERE id = ?", [req.params.id]);
  if (!row || row.status !== "approved") return res.status(404).json({ error: "Arquivo nao encontrado." });
  return streamFile(row, req, res, true);
}));

app.get("/api/admin/media/:id/file", requireAdmin, asyncHandler(async (req, res) => {
  const row = await db.get("SELECT * FROM media WHERE id = ?", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Arquivo nao encontrado." });
  const token = String(req.query.t || "");
  if (!validPreviewToken(row.id, token)) return res.status(403).json({ error: "Link de previa expirado." });
  return streamFile(row, req, res, false);
}));

function previewToken(id, exp) {
  const payload = `${id}.${exp}`;
  const sig = crypto.createHmac("sha256", config.sessionSecret).update(payload).digest("hex");
  return `${exp}.${sig}`;
}

function validPreviewToken(id, token) {
  const parts = String(token).split(".");
  if (parts.length !== 2) return false;
  const [exp, sig] = parts;
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = previewToken(id, exp);
  return timingSafeEqual(token, expected);
}

function signPreview(id) {
  const exp = Date.now() + config.signedUrlTtlSec * 1000;
  return previewToken(id, String(exp));
}

async function streamFile(row, req, res, asDownload) {
  const { stream, size } = await storage.stream(row.storage_key);
  res.setHeader("Content-Type", row.mime);
  if (size) res.setHeader("Content-Length", String(size));
  res.setHeader("Cache-Control", row.status === "approved" ? "public, max-age=86400" : "private, no-store");
  if (asDownload) {
    const ext = path.extname(row.storage_key) || "";
    res.setHeader("Content-Disposition", `attachment; filename="elaine-jeferson-${row.id}${ext}"`);
  }
  stream.on("error", () => {
    if (!res.headersSent) res.status(404).end();
    else res.end();
  });
  stream.pipe(res);
}

app.get("/api/admin/stats", requireAdmin, asyncHandler(async (_req, res) => {
  const total = await db.get("SELECT COUNT(*) as c FROM media");
  const pending = await db.get("SELECT COUNT(*) as c FROM media WHERE status = ?", ["pending"]);
  const approved = await db.get("SELECT COUNT(*) as c FROM media WHERE status = ?", ["approved"]);
  const rejected = await db.get("SELECT COUNT(*) as c FROM media WHERE status = ?", ["rejected"]);
  const bytes = await db.get("SELECT COALESCE(SUM(size_bytes),0) as s FROM media");
  const recent = await db.all("SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 12");
  const disk = await storage.usageBytes();
  res.json({
    total: Number(total?.c || 0),
    pending: Number(pending?.c || 0),
    approved: Number(approved?.c || 0),
    rejected: Number(rejected?.c || 0),
    bytes: Number(bytes?.s || 0),
    diskBytes: disk,
    recent: recent.map((r) => ({
      id: r.id,
      action: r.action,
      mediaId: r.media_id,
      detail: r.detail,
      createdAt: r.created_at,
    })),
  });
}));

app.get("/api/admin/media", requireAdmin, asyncHandler(async (req, res) => {
  const status = ["pending", "approved", "rejected"].includes(req.query.status) ? req.query.status : "";
  const type = ["photo", "video"].includes(req.query.type) ? req.query.type : "";
  const q = sanitizeText(req.query.q, 80).toLowerCase();
  let sql = "SELECT * FROM media WHERE 1=1";
  const params = [];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (type) {
    sql += " AND kind = ?";
    params.push(type);
  }
  if (q) {
    sql += " AND (LOWER(COALESCE(guest_name,'')) LIKE ? OR LOWER(COALESCE(caption,'')) LIKE ? OR LOWER(original_name) LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY created_at DESC LIMIT 200";
  const rows = await db.all(sql, params);
  res.json({
    items: rows.map((row) => ({
      ...adminMedia(row),
      previewToken: signPreview(row.id),
    })),
  });
}));

async function setStatus(ids, status, admin, reason) {
  const unique = [...new Set((ids || []).map(String))].slice(0, 100);
  const updated = [];
  for (const id of unique) {
    const row = await db.get("SELECT * FROM media WHERE id = ?", [id]);
    if (!row) continue;
    let key = row.storage_key;
    if (status === "approved" && key.startsWith("pending/")) {
      const nextKey = key.replace(/^pending\//, "approved/");
      const { stream } = await storage.stream(key);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      await storage.put(nextKey, Buffer.concat(chunks), row.mime);
      await storage.remove(key);
      key = nextKey;
    }
    if (status === "rejected" && key.startsWith("pending/")) {
      const nextKey = key.replace(/^pending\//, "rejected/");
      const { stream } = await storage.stream(key);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      await storage.put(nextKey, Buffer.concat(chunks), row.mime);
      await storage.remove(key);
      key = nextKey;
    }
    await db.run(
      "UPDATE media SET status = ?, reject_reason = ?, reviewed_at = ?, reviewed_by = ?, storage_key = ? WHERE id = ?",
      [status, status === "rejected" ? sanitizeText(reason, 280) : null, nowIso(), admin.email, key, id]
    );
    await db.run("INSERT INTO audit_log (id, action, media_id, detail, created_at) VALUES (?, ?, ?, ?, ?)", [
      newId(),
      status,
      id,
      reason || admin.email,
      nowIso(),
    ]);
    updated.push(id);
  }
  return updated;
}

app.post("/api/admin/media/approve", requireAdmin, asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const updated = await setStatus(ids, "approved", req.admin, "");
  res.json({ ok: true, updated });
}));

app.post("/api/admin/media/reject", requireAdmin, asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const reason = sanitizeText(req.body?.reason, 280);
  const updated = await setStatus(ids, "rejected", req.admin, reason);
  res.json({ ok: true, updated });
}));

app.post("/api/admin/media/delete", requireAdmin, asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const unique = [...new Set(ids.map(String))].slice(0, 100);
  const removed = [];
  for (const id of unique) {
    const row = await db.get("SELECT * FROM media WHERE id = ?", [id]);
    if (!row) continue;
    await storage.remove(row.storage_key);
    await db.run("DELETE FROM media WHERE id = ?", [id]);
    await db.run("INSERT INTO audit_log (id, action, media_id, detail, created_at) VALUES (?, ?, ?, ?, ?)", [
      newId(),
      "delete",
      id,
      req.admin.email,
      nowIso(),
    ]);
    removed.push(id);
  }
  res.json({ ok: true, removed });
}));

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: "Arquivo grande demais ou envio invalido." });
  }
  console.error(err);
  res.status(500).json({ error: "Erro interno. Tente novamente." });
});

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`Galeria Elaine & Jeferson na porta ${config.port}`);
});

export { app, server, db };
