import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

let driver = "sqlite";
let sqlite;
let pool;

function sqliteNow() {
  return new Date().toISOString();
}

class SqliteDb {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  exec(sql) {
    this.db.exec(sql);
  }

  run(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) ?? null;
  }

  all(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }
}

class PgDb {
  constructor(clientPool) {
    this.pool = clientPool;
  }

  toPg(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  async exec(sql) {
    await this.pool.query(sql);
  }

  async run(sql, params = []) {
    const result = await this.pool.query(this.toPg(sql), params);
    return { changes: result.rowCount };
  }

  async get(sql, params = []) {
    const result = await this.pool.query(this.toPg(sql), params);
    return result.rows[0] ?? null;
  }

  async all(sql, params = []) {
    const result = await this.pool.query(this.toPg(sql), params);
    return result.rows;
  }
}

export async function initDb() {
  if (config.databaseUrl) {
    driver = "pg";
    pool = new pg.Pool({
      connectionString: config.databaseUrl,
      max: 8,
      ssl: config.databaseUrl.includes("localhost") ? false : { rejectUnauthorized: false },
    });
    const db = new PgDb(pool);
    await migrate(db, "pg");
    return db;
  }

  driver = "sqlite";
  const file = path.join(config.dataDir, "gallery.sqlite");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  sqlite = new SqliteDb(file);
  await migrate(sqlite, "sqlite");
  return sqlite;
}

async function migrate(db, kind) {
  const id = kind === "pg" ? "TEXT PRIMARY KEY" : "TEXT PRIMARY KEY";
  const now = kind === "pg" ? "TIMESTAMPTZ NOT NULL DEFAULT NOW()" : "TEXT NOT NULL";
  const intType = kind === "pg" ? "INTEGER" : "INTEGER";
  const text = "TEXT";

  await db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id ${id},
      email ${text} NOT NULL UNIQUE,
      password_hash ${text} NOT NULL,
      created_at ${now},
      updated_at ${now}
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id ${id},
      admin_id ${text} NOT NULL,
      expires_at ${text} NOT NULL,
      created_at ${now}
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id ${id},
      email ${text} NOT NULL,
      ip ${text} NOT NULL,
      success ${intType} NOT NULL,
      created_at ${now}
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id ${id},
      status ${text} NOT NULL,
      kind ${text} NOT NULL,
      mime ${text} NOT NULL,
      original_name ${text} NOT NULL,
      storage_key ${text} NOT NULL UNIQUE,
      size_bytes ${intType} NOT NULL,
      width ${intType},
      height ${intType},
      duration_sec ${intType},
      checksum ${text} NOT NULL,
      guest_name ${text},
      caption ${text},
      reject_reason ${text},
      created_at ${now},
      reviewed_at ${text},
      reviewed_by ${text}
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id ${id},
      action ${text} NOT NULL,
      media_id ${text},
      detail ${text},
      created_at ${now}
    );
  `);

  if (kind === "sqlite") {
    const nowIso = sqliteNow();
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_media_status ON media(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_media_checksum ON media(checksum);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX IF NOT EXISTS idx_attempts_email ON login_attempts(email, created_at);
    `);
    void nowIso;
  } else {
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_media_status ON media(status, created_at);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_media_checksum ON media(checksum);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_attempts_email ON login_attempts(email, created_at);`);
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function isPg() {
  return driver === "pg";
}
