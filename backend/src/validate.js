import crypto from "node:crypto";
import { ALLOWED_IMAGE, ALLOWED_VIDEO, config } from "./config.js";

export function sanitizeText(value, max) {
  if (value == null) return "";
  const text = String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  return text.slice(0, max);
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

export function detectMime(buffer, declared) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    return "image/webp";
  }
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = b.slice(8, 12).toString("ascii").replace(/\0/g, " ");
    if (["heic", "heif", "mif1", "msf1", "heix", "hevc"].includes(brand.trim())) return "image/heic";
    if (["qt  ", "m4v ", "M4V "].includes(brand)) return "video/quicktime";
    return "video/mp4";
  }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (declared && (ALLOWED_IMAGE.has(declared) || ALLOWED_VIDEO.has(declared))) {
    if (declared.startsWith("image/heic") || declared.startsWith("image/heif")) return declared;
  }
  return null;
}

export function kindFromMime(mime) {
  if (ALLOWED_IMAGE.has(mime)) return "photo";
  if (ALLOWED_VIDEO.has(mime)) return "video";
  return null;
}

export function checksum(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function safeFileName(name) {
  return String(name || "arquivo")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function validatePassword(password) {
  const p = String(password || "");
  if (p.length < 10) return "A senha deve ter pelo menos 10 caracteres.";
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return "A senha deve misturar letras e numeros.";
  return null;
}

export function maxBytesFor(kind) {
  if (kind === "photo") return config.limits.photoMb * 1024 * 1024;
  return config.limits.videoMb * 1024 * 1024;
}

export function readMp4Duration(buffer) {
  try {
    let offset = 0;
    while (offset + 8 <= buffer.length) {
      let size = buffer.readUInt32BE(offset);
      const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
      if (size === 1 && offset + 16 <= buffer.length) {
        size = Number(buffer.readBigUInt64BE(offset + 8));
      }
      if (!size || size < 8) break;
      if (type === "moov") {
        return scanMoov(buffer, offset + 8, offset + size);
      }
      offset += size;
    }
  } catch {
    return null;
  }
  return null;
}

function scanMoov(buffer, start, end) {
  let offset = start;
  while (offset + 8 <= end && offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString("ascii");
    if (!size || size < 8) break;
    if (type === "mvhd" && offset + 24 <= buffer.length) {
      const version = buffer[offset + 8];
      if (version === 0 && offset + 32 <= buffer.length) {
        const timescale = buffer.readUInt32BE(offset + 20);
        const duration = buffer.readUInt32BE(offset + 24);
        if (timescale > 0) return Math.round(duration / timescale);
      }
    }
    offset += size;
  }
  return null;
}
