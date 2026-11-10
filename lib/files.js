const fs = require("fs");
const path = require("path");
const FileType = require("file-type");
const sharp = require("sharp");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const THUMB_DIR = path.join(UPLOAD_DIR, "thumbs");

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);
const VIDEO_EXT = new Set(["mp4", "mov", "quicktime"]);

const ALLOWED_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

function ensureDirs() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(THUMB_DIR, { recursive: true });
}

async function heicToJpegBuffer(filePath) {
  const convert = require("heic-convert");
  const input = fs.readFileSync(filePath);
  return convert({ buffer: input, format: "JPEG", quality: 0.9 });
}

async function makeWebpVersions(sourcePath, baseName) {
  const displayName = baseName + "-display.webp";
  const thumbName = baseName + "-thumb.webp";
  await sharp(sourcePath)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(path.join(THUMB_DIR, displayName));
  await sharp(sourcePath)
    .rotate()
    .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(path.join(THUMB_DIR, thumbName));
  return { displayName, thumbName };
}

async function processAlbumPhoto(file, limits) {
  ensureDirs();
  const kind = claimedKind(file);
  if (kind !== "image") {
    safeUnlink(file.path);
    return { ok: false, error: "O álbum do ensaio aceita apenas fotos (JPG, PNG, WEBP, HEIC)." };
  }
  if (file.size > limits.image) {
    safeUnlink(file.path);
    const mb = Math.round(limits.image / (1024 * 1024));
    return { ok: false, error: "Esta foto passa do limite de " + mb + " MB." };
  }

  const detected = await inspect(file.path);
  if (!detected || !ALLOWED_MIME[detected.mime] || !detected.mime.startsWith("image/")) {
    safeUnlink(file.path);
    return { ok: false, error: "O arquivo não parece ser uma foto válida." };
  }

  const originalName = path.basename(file.path);
  const baseName = originalName.replace(path.extname(originalName), "");
  let sharpSource = file.path;
  let tempJpeg = null;

  if (detected.mime === "image/heic" || detected.mime === "image/heif") {
    try {
      const jpegBuf = await heicToJpegBuffer(file.path);
      tempJpeg = path.join(THUMB_DIR, baseName + "-heic.jpg");
      fs.writeFileSync(tempJpeg, jpegBuf);
      sharpSource = tempJpeg;
    } catch {
      safeUnlink(file.path);
      return { ok: false, error: "Não foi possível ler este arquivo HEIC. Tente salvar como JPG." };
    }
  }

  let displayName = null;
  let thumbName = null;
  try {
    const versions = await makeWebpVersions(sharpSource, baseName);
    displayName = versions.displayName;
    thumbName = versions.thumbName;
  } catch {
    safeUnlink(file.path);
    safeUnlink(tempJpeg);
    return { ok: false, error: "Não foi possível gerar a versão de exibição desta foto." };
  }
  safeUnlink(tempJpeg);

  return {
    ok: true,
    kind: "image",
    mime: detected.mime,
    ext: ALLOWED_MIME[detected.mime],
    storedName: originalName,
    displayName,
    thumbName,
  };
}

async function ensureDisplayVersions(item) {
  if (!item || item.kind !== "image") return item;
  if (item.display && item.thumb && item.thumb.indexOf(".webp") !== -1) return item;
  const original = path.join(UPLOAD_DIR, item.filename);
  if (!fs.existsSync(original)) return item;
  const baseName = item.filename.replace(path.extname(item.filename), "");
  let source = original;
  let tempJpeg = null;
  const ext = path.extname(item.filename).toLowerCase();
  if (ext === ".heic" || ext === ".heif") {
    try {
      const jpegBuf = await heicToJpegBuffer(original);
      tempJpeg = path.join(THUMB_DIR, baseName + "-heic.jpg");
      fs.writeFileSync(tempJpeg, jpegBuf);
      source = tempJpeg;
    } catch {
      return item;
    }
  }
  try {
    const versions = await makeWebpVersions(source, baseName);
    item.display = versions.displayName;
    item.thumb = versions.thumbName;
  } catch {
    /* keep item as-is */
  }
  safeUnlink(tempJpeg);
  return item;
}

function extFromName(name) {
  return path.extname(name || "").replace(".", "").toLowerCase();
}

function claimedKind(file) {
  const ext = extFromName(file.originalname);
  const mime = (file.mimetype || "").toLowerCase();
  if (IMAGE_EXT.has(ext) || mime.startsWith("image/")) return "image";
  if (VIDEO_EXT.has(ext) || mime.startsWith("video/")) return "video";
  return null;
}

async function inspect(filePath) {
  const buffer = fs.readFileSync(filePath);
  const sample = buffer.slice(0, 4100);
  let detected = await FileType.fromBuffer(sample);

  if (!detected) {
    const header = buffer.slice(0, 12).toString("ascii");
    if (header.includes("ftyp")) {
      const brand = buffer.slice(8, 12).toString("ascii");
      if (["heic", "heix", "mif1", "msf1", "heif"].includes(brand)) {
        detected = { mime: "image/heic", ext: "heic" };
      } else if (["qt  ", "moov"].includes(brand) || brand.startsWith("qt")) {
        detected = { mime: "video/quicktime", ext: "mov" };
      } else if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "MSNV"].includes(brand)) {
        detected = { mime: "video/mp4", ext: "mp4" };
      }
    }
  }

  return detected;
}

async function validateAndNormalize(file, limits) {
  ensureDirs();
  const kind = claimedKind(file);
  if (!kind) {
    safeUnlink(file.path);
    return { ok: false, error: "Envie apenas fotos (JPG, PNG, HEIC, WEBP) ou vídeos (MP4, MOV)." };
  }

  const maxBytes = kind === "video" ? limits.video : limits.image;
  if (file.size > maxBytes) {
    safeUnlink(file.path);
    const mb = Math.round(maxBytes / (1024 * 1024));
    return {
      ok: false,
      error:
        kind === "video"
          ? `Este vídeo passa do limite de ${mb} MB.`
          : `Esta foto passa do limite de ${mb} MB.`,
    };
  }

  const detected = await inspect(file.path);
  if (!detected || !ALLOWED_MIME[detected.mime]) {
    safeUnlink(file.path);
    return { ok: false, error: "O arquivo não parece ser uma foto ou vídeo válido." };
  }

  const realKind = detected.mime.startsWith("image/") ? "image" : "video";
  if (realKind !== kind) {
    safeUnlink(file.path);
    return { ok: false, error: "O tipo do arquivo não confere com a extensão." };
  }

  let storedPath = file.path;
  let displayExt = ALLOWED_MIME[detected.mime];
  let mime = detected.mime;
  let convertedFromHeic = false;

  if (detected.mime === "image/heic" || detected.mime === "image/heif") {
    try {
      const convert = require("heic-convert");
      const input = fs.readFileSync(file.path);
      const output = await convert({ buffer: input, format: "JPEG", quality: 0.86 });
      const jpgPath = file.path.replace(path.extname(file.path), "") + ".jpg";
      fs.writeFileSync(jpgPath, output);
      safeUnlink(file.path);
      storedPath = jpgPath;
      displayExt = "jpg";
      mime = "image/jpeg";
      convertedFromHeic = true;
    } catch {
      safeUnlink(file.path);
      return { ok: false, error: "Não foi possível ler este arquivo HEIC. Tente salvar como JPG." };
    }
  }

  let thumbName = null;
  if (realKind === "image") {
    try {
      thumbName = path.basename(storedPath).replace(path.extname(storedPath), "") + "-thumb.jpg";
      await sharp(storedPath)
        .rotate()
        .resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toFile(path.join(THUMB_DIR, thumbName));
    } catch {
      thumbName = null;
    }
  }

  return {
    ok: true,
    kind: realKind,
    mime,
    ext: displayExt,
    storedPath,
    storedName: path.basename(storedPath),
    thumbName,
    convertedFromHeic,
  };
}

function safeUnlink(p) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function removeFiles(item) {
  if (!item) return;
  safeUnlink(path.join(UPLOAD_DIR, item.filename));
  if (item.thumb) safeUnlink(path.join(THUMB_DIR, item.thumb));
  if (item.display) safeUnlink(path.join(THUMB_DIR, item.display));
}

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  THUMB_DIR,
  ensureDirs,
  validateAndNormalize,
  processAlbumPhoto,
  ensureDisplayVersions,
  removeFiles,
  safeUnlink,
};
