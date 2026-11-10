const fs = require("fs");
const path = require("path");

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
const MEDIA_FILE = path.join(DATA_DIR, "media.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(MEDIA_FILE)) fs.writeFileSync(MEDIA_FILE, "[]");
  if (!fs.existsSync(ADMINS_FILE)) fs.writeFileSync(ADMINS_FILE, "[]");
  if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, "{\"heroId\":null}");
}

function readJson(file) {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return [];
  }
}

function writeJson(file, data) {
  ensure();
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function getMedia() {
  return readJson(MEDIA_FILE);
}

function saveMedia(list) {
  writeJson(MEDIA_FILE, list);
}

function getAdmins() {
  return readJson(ADMINS_FILE);
}

function saveAdmins(list) {
  writeJson(ADMINS_FILE, list);
}

function addMedia(item) {
  const list = getMedia();
  list.unshift(item);
  saveMedia(list);
  return item;
}

function updateMedia(id, patch) {
  const list = getMedia();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
  saveMedia(list);
  return list[idx];
}

function removeMedia(id) {
  const list = getMedia();
  const item = list.find((m) => m.id === id);
  const next = list.filter((m) => m.id !== id);
  saveMedia(next);
  return item || null;
}

function approvedMedia() {
  return getMedia().filter((m) => m.status === "approved");
}

function getSettings() {
  const data = readJson(SETTINGS_FILE);
  if (!data || Array.isArray(data)) return { heroId: null };
  return data;
}

function saveSettings(data) {
  writeJson(SETTINGS_FILE, data);
}

function ensaioPhotos() {
  return getMedia()
    .filter(function (m) { return m.album === "ensaio" && m.status === "approved"; })
    .sort(function (a, b) {
      const ao = Number(a.order || 0);
      const bo = Number(b.order || 0);
      if (ao !== bo) return ao - bo;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
}

module.exports = {
  DATA_DIR,
  ensure,
  getMedia,
  saveMedia,
  getAdmins,
  saveAdmins,
  addMedia,
  updateMedia,
  removeMedia,
  approvedMedia,
  getSettings,
  saveSettings,
  ensaioPhotos,
};
