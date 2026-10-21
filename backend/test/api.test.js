import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ej-gallery-"));
process.env.NODE_ENV = "test";
process.env.PORT = "0";
process.env.DATA_DIR = tmp;
process.env.SESSION_SECRET = "test-session-secret-elaine-jeferson-gallery";
process.env.SETUP_TOKEN = "test-setup-token-abcdef";
process.env.STORAGE_DRIVER = "local";
process.env.PUBLIC_URL = "http://127.0.0.1";

const { app, server, db } = await import("../src/server.js");

function listenAddress() {
  const addr = server.address();
  return `http://127.0.0.1:${addr.port}`;
}

function jpegBytes() {
  const buf = Buffer.alloc(256, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

async function req(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.cookie = options.cookie;
  const res = await fetch(listenAddress() + pathname, { ...options, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { res, json, text };
}

let cookie = "";

before(async () => {
  await new Promise((resolve) => {
    if (server.listening) resolve();
    else server.on("listening", resolve);
  });
});

after(async () => {
  server.close();
});

test("pagina de saude e metadados do site", async () => {
  const health = await req("/api/health");
  assert.equal(health.res.status, 200);
  assert.equal(health.json.ok, true);
  const site = await req("/api/site");
  assert.equal(site.json.couple, "Elaine & Jeferson");
  assert.equal(site.json.setupRequired, true);
});

test("setup cria administrador e login protege o painel", async () => {
  const denied = await req("/api/admin/stats");
  assert.equal(denied.res.status, 401);

  const badToken = await req("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setupToken: "errado", email: "casal@example.com", password: "SenhaForte123" }),
  });
  assert.equal(badToken.res.status, 403);

  const setup = await req("/api/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setupToken: "test-setup-token-abcdef",
      email: "casal@example.com",
      password: "SenhaForte123",
    }),
  });
  assert.equal(setup.res.status, 200);
  const rawCookie = setup.res.headers.get("set-cookie") || "";
  cookie = (rawCookie.match(/ej_session=[^;]+/) || [""])[0];
  assert.ok(cookie);

  const stats = await req("/api/admin/stats", { cookie });
  assert.equal(stats.res.status, 200);
  assert.equal(stats.json.total, 0);
});

test("upload, bloqueio publico de pendentes e aprovacao", async () => {
  const form = new FormData();
  form.set("guestName", "Tia Ana");
  form.set("caption", "Chegando na igreja");
  form.set("files", new Blob([jpegBytes()], { type: "image/jpeg" }), "foto.jpg");
  const up = await fetch(listenAddress() + "/api/uploads", { method: "POST", body: form });
  const upJson = await up.json();
  assert.equal(up.status, 201);
  assert.equal(upJson.accepted.length, 1);
  const id = upJson.accepted[0].id;

  const publicFile = await req(`/api/media/${id}/file`);
  assert.equal(publicFile.res.status, 404);

  const gallery = await req("/api/gallery");
  assert.equal(gallery.json.items.length, 0);

  const approve = await req("/api/admin/media/approve", {
    method: "POST",
    cookie,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [id] }),
  });
  assert.equal(approve.res.status, 200);

  const gallery2 = await req("/api/gallery");
  assert.equal(gallery2.json.items.length, 1);
  const file = await req(`/api/media/${id}/file`);
  assert.equal(file.res.status, 200);
});

test("rejeita arquivo invalido", async () => {
  const form = new FormData();
  form.set("files", new Blob([Buffer.from("not-a-media")], { type: "text/plain" }), "nota.txt");
  const up = await fetch(listenAddress() + "/api/uploads", { method: "POST", body: form });
  assert.equal(up.status, 400);
});
