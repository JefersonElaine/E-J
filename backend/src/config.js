import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

function loadEnvFile() {
  const candidates = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
    }
  }
}

loadEnvFile();

const root = path.resolve(process.cwd());

function env(name, fallback = "") {
  const value = process.env[name];
  return value == null || value === "" ? fallback : value;
}

function envInt(name, fallback) {
  const raw = env(name, String(fallback));
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const parsedPort = Number.parseInt(env("PORT", "3001"), 10);

export const config = {
  nodeEnv: env("NODE_ENV", "development"),
  port: Number.isFinite(parsedPort) && parsedPort >= 0 ? parsedPort : 3001,
  publicUrl: env("PUBLIC_URL", "http://localhost:5173").replace(/\/$/, ""),
  sessionSecret: env("SESSION_SECRET", ""),
  setupToken: env("SETUP_TOKEN", ""),
  dataDir: path.resolve(env("DATA_DIR", path.join(root, "data"))),
  databaseUrl: env("DATABASE_URL", ""),
  storageDriver: env("STORAGE_DRIVER", "local").toLowerCase(),
  s3: {
    endpoint: env("S3_ENDPOINT", ""),
    region: env("S3_REGION", "auto"),
    bucket: env("S3_BUCKET", ""),
    accessKeyId: env("S3_ACCESS_KEY_ID", ""),
    secretAccessKey: env("S3_SECRET_ACCESS_KEY", ""),
    publicBaseUrl: env("S3_PUBLIC_BASE_URL", "").replace(/\/$/, ""),
    forcePathStyle: env("S3_FORCE_PATH_STYLE", "true") !== "false",
  },
  limits: {
    photoMb: envInt("MAX_PHOTO_MB", 12),
    videoMb: envInt("MAX_VIDEO_MB", 80),
    filesPerUpload: envInt("MAX_FILES_PER_UPLOAD", 10),
    maxVideoSeconds: envInt("MAX_VIDEO_SECONDS", 90),
    guestName: 80,
    caption: 280,
  },
  cookieName: "ej_session",
  sessionTtlMs: 1000 * 60 * 60 * 12,
  signedUrlTtlSec: 15 * 60,
};

export function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(path.join(config.dataDir, "uploads"), { recursive: true });
  fs.mkdirSync(path.join(config.dataDir, "tmp"), { recursive: true });
}

export function assertSecrets() {
  if (!config.sessionSecret || config.sessionSecret.length < 24) {
    if (config.nodeEnv === "production") {
      throw new Error("SESSION_SECRET deve ter pelo menos 24 caracteres.");
    }
    config.sessionSecret = crypto.randomBytes(48).toString("hex");
  }
  if (!config.setupToken || config.setupToken.length < 16) {
    if (config.nodeEnv === "production") {
      throw new Error("SETUP_TOKEN deve ter pelo menos 16 caracteres.");
    }
    config.setupToken = crypto.randomBytes(24).toString("hex");
    console.warn(
      "[galeria] SETUP_TOKEN gerado apenas para desenvolvimento. Defina SETUP_TOKEN no .env antes de publicar."
    );
  }
}

export const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
export const ALLOWED_VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);
