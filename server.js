require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");
const archiver = require("archiver");
const QRCode = require("qrcode");

const db = require("./lib/db");
const auth = require("./lib/auth");
const files = require("./lib/files");

db.ensure();
files.ensureDirs();
auth.seedAdminFromEnv();

async function seedCouplePhotos() {
  const seeds = [
    { id: "seed-1", src: "hero.jpg", name: "elaine-jeferson-praia.jpg", caption: "Praia ao entardecer", order: 1 },
    { id: "seed-2", src: "hero2.jpg", name: "elaine-jeferson-ondas.jpg", caption: "Correndo nas ondas", order: 2 },
  ];
  const list = db.getMedia();
  let changed = false;
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    let existing = list.find(function (m) { return m.id === s.id; });
    if (!existing) {
      const src = path.join(__dirname, "public", "assets", s.src);
      if (!fs.existsSync(src)) continue;
      const destName = s.id + path.extname(src);
      const dest = path.join(files.UPLOAD_DIR, destName);
      fs.copyFileSync(src, dest);
      existing = {
        id: s.id,
        filename: destName,
        thumb: null,
        display: null,
        kind: "image",
        mime: "image/jpeg",
        originalName: s.name,
        size: fs.statSync(dest).size,
        guestName: "Elaine & Jeferson",
        caption: s.caption,
        album: "ensaio",
        status: "approved",
        order: s.order,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      list.unshift(existing);
      changed = true;
    }
    if (existing.album !== "ensaio") {
      existing.album = "ensaio";
      changed = true;
    }
    if (!existing.order) {
      existing.order = s.order;
      changed = true;
    }
    const beforeThumb = existing.thumb;
    const beforeDisplay = existing.display;
    await files.ensureDisplayVersions(existing);
    if (existing.thumb !== beforeThumb || existing.display !== beforeDisplay) changed = true;
  }
  if (changed) db.saveMedia(list);
  const settings = db.getSettings();
  if (!settings.heroId) {
    const first = db.ensaioPhotos()[0];
    if (first) {
      settings.heroId = first.id;
      db.saveSettings(settings);
    }
  }
}

seedCouplePhotos().catch(function (err) {
  console.error("Falha ao preparar o ensaio:", err.message);
});

const PORT = Number(process.env.PORT || 3000);
const MAX_IMAGE_MB = Number(process.env.MAX_IMAGE_MB || 15);
const MAX_VIDEO_MB = Number(process.env.MAX_VIDEO_MB || 80);
const LIMITS = {
  image: MAX_IMAGE_MB * 1024 * 1024,
  video: MAX_VIDEO_MB * 1024 * 1024,
};
const MAX_FILES = 8;

const app = express();
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

const sessionDir = path.join(db.DATA_DIR, "sessions");
fs.mkdirSync(sessionDir, { recursive: true });

app.use(
  session({
    store: new FileStore({
      path: sessionDir,
      ttl: 60 * 60 * 24 * 14,
      retries: 1,
      logFn: function () {},
    }),
    name: "ej.sid",
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  })
);

function sendGuestPage(req, res) {
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");
  const origin = proto + "://" + host;
  const html = fs
    .readFileSync(path.join(__dirname, "public", "index.html"), "utf8")
    .replace(/__ORIGIN__/g, origin);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}
app.get("/", sendGuestPage);
app.get("/index.html", sendGuestPage);

app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h", index: false }));

app.use("/uploads", (req, res, next) => {
  if (req.path.startsWith("/thumbs/")) return next();
  const name = path.basename(req.path);
  const item = db.getMedia().find((m) => m.filename === name);
  if (!item) return res.status(404).end();
  if (item.status === "approved") return next();
  if (req.session && req.session.admin) return next();
  return res.status(404).end();
});
app.use("/uploads", express.static(files.UPLOAD_DIR, { maxAge: "7d", fallthrough: false }));

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    files.ensureDirs();
    cb(null, files.UPLOAD_DIR);
  },
  filename: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 8);
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: LIMITS.video, files: MAX_FILES },
  fileFilter: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const okExt = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".mp4", ".mov"];
    const mime = (file.mimetype || "").toLowerCase();
    const okMime =
      mime.startsWith("image/") ||
      mime.startsWith("video/") ||
      mime === "application/octet-stream";
    if (okExt.includes(ext) && okMime) return cb(null, true);
    cb(new Error("Tipo de arquivo não permitido."));
  },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: function (req) {
    return req.ip || "unknown";
  },
  handler: function (_req, res) {
    res.status(429).json({
      error: "Muitos envios em pouco tempo. Espere um minuto e tente de novo.",
    });
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  handler: function (_req, res) {
    res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
  },
});

function publicItem(m) {
  const display = m.display
    ? "/uploads/thumbs/" + m.display
    : "/uploads/" + m.filename;
  const thumb = m.thumb
    ? "/uploads/thumbs/" + m.thumb
    : display;
  return {
    id: m.id,
    kind: m.kind,
    caption: m.caption || "",
    guestName: m.guestName || "",
    createdAt: m.createdAt,
    url: display,
    originalUrl: "/uploads/" + m.filename,
    thumb: thumb,
    mime: m.mime,
    album: m.album || "festa",
    order: m.order || 0,
    isHero: !!(db.getSettings().heroId && db.getSettings().heroId === m.id),
  };
}

function adminItem(m) {
  return {
    ...publicItem(m),
    status: m.status,
    originalName: m.originalName,
    size: m.size,
  };
}

app.get("/api/health", function (_req, res) {
  res.json({ ok: true });
});

app.get("/api/config", function (_req, res) {
  res.json({
    maxImageMb: MAX_IMAGE_MB,
    maxVideoMb: MAX_VIDEO_MB,
    maxFiles: MAX_FILES,
    couple: "Elaine & Jeferson",
    date: "27 de novembro de 2026",
  });
});

app.get("/api/gallery", function (req, res) {
  const since = req.query.since || "";
  const all = db.approvedMedia();
  const ensaio = db.ensaioPhotos();
  const festa = all.filter(function (m) { return m.album !== "ensaio"; });
  const items = since
    ? festa.filter(function (m) { return m.createdAt > since || m.updatedAt > since; })
    : festa;
  const latest = festa.reduce(function (acc, m) {
    const t = m.updatedAt || m.createdAt;
    return t > acc ? t : acc;
  }, "");
  const settings = db.getSettings();
  const hero = ensaio.find(function (m) { return m.id === settings.heroId; }) || ensaio[0] || null;
  res.json({
    items: items.map(publicItem),
    ensaio: ensaio.map(publicItem),
    hero: hero ? publicItem(hero) : null,
    latest,
    count: festa.length,
  });
});

app.post("/api/upload", uploadLimiter, function (req, res) {
  upload.array("files", MAX_FILES)(req, res, async function (err) {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Um dos arquivos passa do limite de tamanho."
          : err.message || "Não foi possível enviar.";
      return res.status(400).json({ error: msg });
    }
    const uploaded = req.files || [];
    if (!uploaded.length) {
      return res.status(400).json({ error: "Selecione ao menos uma foto ou vídeo." });
    }

    const guestName = String(req.body.guestName || "").trim().slice(0, 60);
    const caption = String(req.body.caption || "").trim().slice(0, 180);
    const saved = [];
    const errors = [];

    for (const file of uploaded) {
      try {
        const result = await files.validateAndNormalize(file, LIMITS);
        if (!result.ok) {
          errors.push({ name: file.originalname, error: result.error });
          continue;
        }
        const item = db.addMedia({
          id: uuidv4(),
          filename: result.storedName,
          thumb: result.thumbName,
          kind: result.kind,
          mime: result.mime,
          originalName: file.originalname,
          size: file.size,
          guestName,
          caption,
          album: "festa",
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        saved.push({ id: item.id, name: file.originalname, kind: item.kind });
      } catch {
        files.safeUnlink(file.path);
        errors.push({ name: file.originalname, error: "Falha ao processar este arquivo." });
      }
    }

    if (!saved.length) {
      return res.status(400).json({
        error: errors[0] ? errors[0].error : "Nenhum arquivo foi aceito.",
        errors,
      });
    }

    res.json({
      ok: true,
      message: "Recebido! Sua foto aparecera na galeria depois da aprovacao.",
      saved,
      errors,
    });
  });
});

app.post("/api/admin/login", loginLimiter, function (req, res) {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const admin = auth.verify(username, password);
  if (!admin) {
    return res.status(401).json({ error: "Usuario ou senha incorretos." });
  }
  req.session.admin = admin;
  req.session.save(function () {
    res.json({ ok: true, admin });
  });
});

app.post("/api/admin/logout", function (req, res) {
  req.session.destroy(function () {
    res.json({ ok: true });
  });
});

app.get("/api/admin/me", function (req, res) {
  if (!req.session || !req.session.admin) return res.status(401).json({ error: "Não autorizado." });
  res.json({ admin: req.session.admin });
});

app.get("/api/admin/media", auth.requireAuth, function (req, res) {
  const status = req.query.status || "all";
  let list = db.getMedia().filter(function (m) { return m.album !== "ensaio"; });
  if (status !== "all") list = list.filter((m) => m.status === status);
  const counts = db.getMedia().filter(function (m) { return m.album !== "ensaio"; }).reduce(
    function (acc, m) {
      acc[m.status] = (acc[m.status] || 0) + 1;
      acc.all += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0, all: 0 }
  );
  res.json({ items: list.map(adminItem), counts });
});

const albumUpload = multer({
  storage,
  limits: { fileSize: LIMITS.image, files: 30 },
  fileFilter: function (_req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const okExt = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
    const mime = (file.mimetype || "").toLowerCase();
    const okMime = mime.startsWith("image/") || mime === "application/octet-stream";
    if (okExt.includes(ext) && okMime) return cb(null, true);
    cb(new Error("O álbum do ensaio aceita apenas fotos (JPG, PNG, WEBP, HEIC)."));
  },
});

app.get("/api/admin/ensaio", auth.requireAuth, function (_req, res) {
  const settings = db.getSettings();
  res.json({
    items: db.ensaioPhotos().map(adminItem),
    heroId: settings.heroId || null,
  });
});

app.post("/api/admin/ensaio/upload", auth.requireAuth, function (req, res) {
  albumUpload.array("files", 30)(req, res, async function (err) {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Uma das fotos passa do limite de tamanho."
          : err.message || "Não foi possível enviar.";
      return res.status(400).json({ error: msg });
    }
    const uploaded = req.files || [];
    if (!uploaded.length) {
      return res.status(400).json({ error: "Selecione ao menos uma foto." });
    }
    let captions = [];
    try {
      captions = JSON.parse(req.body.captions || "[]");
    } catch {
      captions = [];
    }
    const existing = db.ensaioPhotos();
    let nextOrder = existing.reduce(function (acc, m) {
      return Math.max(acc, Number(m.order || 0));
    }, 0);
    const saved = [];
    const errors = [];
    for (let i = 0; i < uploaded.length; i++) {
      const file = uploaded[i];
      try {
        const result = await files.processAlbumPhoto(file, LIMITS);
        if (!result.ok) {
          errors.push({ name: file.originalname, error: result.error });
          continue;
        }
        nextOrder += 1;
        const caption = String((captions && captions[i]) || "").trim().slice(0, 180);
        const item = db.addMedia({
          id: uuidv4(),
          filename: result.storedName,
          display: result.displayName,
          thumb: result.thumbName,
          kind: "image",
          mime: result.mime,
          originalName: file.originalname,
          size: file.size,
          guestName: "Elaine & Jeferson",
          caption: caption,
          album: "ensaio",
          status: "approved",
          order: nextOrder,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        saved.push({ id: item.id, name: file.originalname });
      } catch {
        files.safeUnlink(file.path);
        errors.push({ name: file.originalname, error: "Falha ao processar esta foto." });
      }
    }
    if (!saved.length) {
      return res.status(400).json({
        error: errors[0] ? errors[0].error : "Nenhuma foto foi aceita.",
        errors,
      });
    }
    res.json({ ok: true, saved, errors, items: db.ensaioPhotos().map(adminItem) });
  });
});

app.post("/api/admin/ensaio/reorder", auth.requireAuth, function (req, res) {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: "Lista de ordem vazia." });
  const list = db.getMedia();
  ids.forEach(function (id, i) {
    const item = list.find(function (m) { return m.id === id && m.album === "ensaio"; });
    if (item) {
      item.order = i + 1;
      item.updatedAt = new Date().toISOString();
    }
  });
  db.saveMedia(list);
  res.json({ ok: true, items: db.ensaioPhotos().map(adminItem) });
});

app.post("/api/admin/ensaio/caption", auth.requireAuth, function (req, res) {
  const id = String(req.body.id || "");
  const caption = String(req.body.caption || "").trim().slice(0, 180);
  const current = db.getMedia().find(function (m) { return m.id === id && m.album === "ensaio"; });
  if (!current) return res.status(404).json({ error: "Foto não encontrada." });
  const item = db.updateMedia(id, { caption: caption });
  res.json({ ok: true, item: adminItem(item) });
});

app.post("/api/admin/ensaio/hero", auth.requireAuth, function (req, res) {
  const id = String(req.body.id || "");
  const current = db.getMedia().find(function (m) { return m.id === id && m.album === "ensaio"; });
  if (!current) return res.status(404).json({ error: "Foto não encontrada." });
  const settings = db.getSettings();
  settings.heroId = id;
  db.saveSettings(settings);
  res.json({ ok: true, heroId: id });
});

app.post("/api/admin/ensaio/delete", auth.requireAuth, function (req, res) {
  const id = String(req.body.id || "");
  const current = db.getMedia().find(function (m) { return m.id === id && m.album === "ensaio"; });
  if (!current) return res.status(404).json({ error: "Foto não encontrada." });
  const item = db.removeMedia(id);
  if (item) files.removeFiles(item);
  const settings = db.getSettings();
  if (settings.heroId === id) {
    const next = db.ensaioPhotos()[0];
    settings.heroId = next ? next.id : null;
    db.saveSettings(settings);
  }
  res.json({ ok: true, items: db.ensaioPhotos().map(adminItem), heroId: db.getSettings().heroId });
});

app.post("/api/admin/media/action", auth.requireAuth, function (req, res) {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const action = req.body.action;
  if (!ids.length) return res.status(400).json({ error: "Selecione ao menos um item." });
  if (!["approve", "reject", "delete"].includes(action)) {
    return res.status(400).json({ error: "Acao invalida." });
  }

  const changed = [];
  for (const id of ids) {
    const current = db.getMedia().find(function (m) { return m.id === id; });
    if (!current || current.album === "ensaio") continue;
    if (action === "delete") {
      const item = db.removeMedia(id);
      if (item) {
        files.removeFiles(item);
        changed.push(id);
      }
    } else {
      const status = action === "approve" ? "approved" : "rejected";
      const item = db.updateMedia(id, { status });
      if (item) changed.push(id);
    }
  }
  res.json({ ok: true, changed: changed.length });
});

app.get("/api/admin/admins", auth.requireAuth, function (_req, res) {
  res.json({ admins: auth.listPublicAdmins() });
});

app.post("/api/admin/admins", auth.requireAuth, function (req, res) {
  try {
    const created = auth.createAdmin(req.body.username, req.body.password);
    res.json({ ok: true, admin: created });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/admin/password", auth.requireAuth, function (req, res) {
  try {
    auth.changePassword(
      req.session.admin.id,
      String(req.body.currentPassword || ""),
      String(req.body.newPassword || "")
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function streamZip(res, list, filename) {
  if (!list.length) return res.status(404).json({ error: "Nenhuma midia para baixar." });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="' + filename + '"');
  const archive = archiver("zip", { zlib: { level: 6 } });
  archive.on("error", function () {
    try {
      res.status(500).end();
    } catch {
      /* ignore */
    }
  });
  archive.pipe(res);
  list.forEach(function (m, i) {
    const full = path.join(files.UPLOAD_DIR, m.filename);
    if (!fs.existsSync(full)) return;
    const ext = path.extname(m.filename);
    const safeGuest = (m.guestName || "convidado").replace(/[^\w\-]+/g, "_").slice(0, 30);
    archive.file(full, {
      name: String(i + 1).padStart(3, "0") + "-" + safeGuest + "-" + m.id.slice(0, 8) + ext,
    });
  });
  archive.finalize();
}

app.get("/api/download-all", function (req, res) {
  const festa = db.approvedMedia().filter(function (m) { return m.album !== "ensaio"; });
  streamZip(res, festa, "elaine-jeferson-galeria.zip");
});

app.get("/api/admin/download-all", auth.requireAuth, function (req, res) {
  const only = req.query.status === "all" ? "all" : "approved";
  const list = db.getMedia().filter((m) => (only === "all" ? true : m.status === "approved"));
  streamZip(res, list, "elaine-jeferson-galeria.zip");
});

app.get("/admin", function (_req, res) {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/qr.png", async function (req, res) {
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const host = req.get("x-forwarded-host") || req.get("host");
  const url = proto + "://" + host + "/";
  try {
    const png = await QRCode.toBuffer(url, {
      type: "png",
      width: 1400,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#111111", light: "#ffffff" },
    });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(png);
  } catch {
    res.status(500).end();
  }
});

app.get("*", function (req, res, next) {
  if (req.path.startsWith("/api") || req.path.startsWith("/uploads") || req.path.startsWith("/admin")) {
    return next();
  }
  sendGuestPage(req, res);
});

app.use(function (err, _req, res, _next) {
  if (err && err.message) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: "Erro interno." });
});

app.listen(PORT, "0.0.0.0", function () {
  console.log("Galeria Elaine & Jeferson em http://0.0.0.0:" + PORT);
});
