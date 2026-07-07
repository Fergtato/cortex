import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
// DB_PATH lets a container mount a volume for the SQLite file.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data.db");
// CORTEX_TOKEN protects the API when exposed beyond localhost. When set,
// every /api/* request (except the health check) must send
// `Authorization: Bearer <token>`. Leave unset for open local use.
const TOKEN = process.env.CORTEX_TOKEN || "";
// CORS_ORIGIN restricts who may call the API from a browser (default: any).
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

// ---- database ----------------------------------------------------------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// One row per entity. `data` holds the entity's JSON exactly as the app
// produces it, so the schema never has to change when the app's shape does.
for (const table of ["pages", "databases"]) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL)`
  );
}

// ---- app ---------------------------------------------------------------
const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "20mb" }));

// Bearer-token auth for everything except the health check.
app.use("/api", (req, res, next) => {
  if (!TOKEN || req.path === "/health") return next();
  const header = req.get("authorization") || "";
  if (header === `Bearer ${TOKEN}`) return next();
  res.status(401).json({ error: "unauthorized" });
});

/**
 * Registers routes for a collection table:
 *   GET   read the whole map
 *   PATCH apply an incremental delta ({ upserts, deletes }) — the normal save
 *         path; only touches the rows that changed
 *   PUT   replace the whole collection (kept for bulk import / restore)
 */
function collectionRoutes(table) {
  app.get(`/api/${table}`, (_req, res) => {
    const rows = db.prepare(`SELECT id, data FROM ${table}`).all();
    const map = {};
    for (const row of rows) map[row.id] = JSON.parse(row.data);
    res.json(map);
  });

  app.patch(`/api/${table}`, (req, res) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const upserts =
      body.upserts && typeof body.upserts === "object" ? body.upserts : {};
    const deletes = Array.isArray(body.deletes) ? body.deletes : [];
    const apply = db.transaction(() => {
      const upsert = db.prepare(
        `INSERT INTO ${table} (id, data) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`
      );
      for (const [id, value] of Object.entries(upserts)) {
        upsert.run(id, JSON.stringify(value));
      }
      const remove = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
      for (const id of deletes) remove.run(id);
    });
    apply();
    res.json({
      ok: true,
      upserts: Object.keys(upserts).length,
      deletes: deletes.length,
    });
  });

  app.put(`/api/${table}`, (req, res) => {
    const map = req.body && typeof req.body === "object" ? req.body : {};
    const replaceAll = db.transaction((entries) => {
      db.prepare(`DELETE FROM ${table}`).run();
      const insert = db.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`);
      for (const [id, value] of entries) insert.run(id, JSON.stringify(value));
    });
    replaceAll(Object.entries(map));
    res.json({ ok: true, count: Object.keys(map).length });
  });
}

collectionRoutes("pages");
collectionRoutes("databases");

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Cortex API listening on http://localhost:${PORT}`);
  console.log(`sqlite file: ${DB_PATH}`);
  console.log(TOKEN ? "auth: bearer token required" : "auth: OPEN (set CORTEX_TOKEN to protect)");
});
