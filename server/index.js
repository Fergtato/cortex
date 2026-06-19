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
app.use(cors());
app.use(express.json({ limit: "20mb" }));

/** Registers GET (read map) + PUT (replace whole collection) for a table. */
function collectionRoutes(table) {
  app.get(`/api/${table}`, (_req, res) => {
    const rows = db.prepare(`SELECT id, data FROM ${table}`).all();
    const map = {};
    for (const row of rows) map[row.id] = JSON.parse(row.data);
    res.json(map);
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
});
