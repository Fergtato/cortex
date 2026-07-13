import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
// DB_PATH lets a container mount a volume for the SQLite file. The default
// (server/data/data.db) is the same folder the docker-compose bind mount uses,
// so `npm start` and `docker compose up` share one database file.
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "data.db");
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
for (const table of ["pages", "databases", "dashboards", "connections"]) {
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
collectionRoutes("dashboards");

// ---- external API connections -------------------------------------------
// A connection is a named base URL plus a generic auth recipe. Tokens live
// only in this SQLite file and are injected server-side by the proxy below —
// the client never sees them (GET returns `hasToken` instead). New sources
// (Homey, Docker, TMDB, …) are just rows with different base URLs/auth modes;
// no code changes needed per source.
//   auth: "none"   — no credentials
//         "bearer" — Authorization: Bearer <token>
//         "header" — <authKey>: <token>   (custom header)
//         "query"  — ?<authKey>=<token>   (e.g. TMDB v3 api_key)

const AUTH_MODES = ["none", "bearer", "header", "query"];

function readConnection(id) {
  const row = db.prepare("SELECT data FROM connections WHERE id = ?").get(id);
  return row ? JSON.parse(row.data) : null;
}

function maskConnection(conn) {
  const { token, ...rest } = conn;
  return { ...rest, hasToken: Boolean(token) };
}

app.get("/api/connections", (_req, res) => {
  const rows = db.prepare("SELECT data FROM connections").all();
  res.json(rows.map((r) => maskConnection(JSON.parse(r.data))));
});

app.put("/api/connections/:id", (req, res) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const id = req.params.id;
  const existing = readConnection(id);
  const name = String(body.name ?? "").trim();
  const baseUrl = String(body.baseUrl ?? "").trim().replace(/\/+$/, "");
  const auth = AUTH_MODES.includes(body.auth) ? body.auth : "none";
  if (!name || !baseUrl) {
    return res.status(400).json({ error: "name and baseUrl are required" });
  }
  const conn = {
    id,
    name,
    baseUrl,
    auth,
    authKey: String(body.authKey ?? "").trim(),
    // Absent token = keep the stored one (edits without re-entering secrets);
    // empty string = clear it.
    token: body.token === undefined ? existing?.token ?? "" : String(body.token),
  };
  db.prepare(
    `INSERT INTO connections (id, data) VALUES (?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data`
  ).run(id, JSON.stringify(conn));
  res.json(maskConnection(conn));
});

app.delete("/api/connections/:id", (req, res) => {
  db.prepare("DELETE FROM connections WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/** GET/POST/… over a unix domain socket (e.g. the Docker daemon). */
function unixRequest(socketPath, reqPath, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: reqPath, method, headers },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 502,
            contentType: res.headers["content-type"] || "application/json",
            body: data,
          })
        );
      }
    );
    req.on("error", reject);
    req.setTimeout(10000, () => req.destroy(new Error("timeout")));
    if (body) req.write(body);
    req.end();
  });
}

// Forward any method to <connection.baseUrl>/<path>?<query> with the
// connection's credentials injected. Handles CORS (same-origin to the app)
// and keeps secrets off the client. Base URLs may be http(s)://… or
// unix:///path/to.sock (Docker daemon).
app.all("/api/proxy/:id/*", async (req, res) => {
  const conn = readConnection(req.params.id);
  if (!conn) return res.status(404).json({ error: "unknown connection" });

  const subPath = req.params[0] || "";
  const rawQuery = req.originalUrl.split("?")[1] || "";
  const params = new URLSearchParams(rawQuery);
  if (conn.auth === "query" && conn.authKey && conn.token) {
    params.set(conn.authKey, conn.token);
  }
  const query = params.toString();

  const headers = { accept: "application/json" };
  if (conn.auth === "bearer" && conn.token) {
    headers.authorization = `Bearer ${conn.token}`;
  } else if (conn.auth === "header" && conn.authKey && conn.token) {
    headers[conn.authKey.toLowerCase()] = conn.token;
  }

  const hasBody =
    req.body && typeof req.body === "object" && Object.keys(req.body).length > 0;
  const body = hasBody ? JSON.stringify(req.body) : undefined;
  if (body) headers["content-type"] = "application/json";

  try {
    if (conn.baseUrl.startsWith("unix://")) {
      const socketPath = conn.baseUrl.slice("unix://".length);
      const out = await unixRequest(
        socketPath,
        `/${subPath}${query ? `?${query}` : ""}`,
        req.method,
        headers,
        body
      );
      res.status(out.status).type(out.contentType).send(out.body);
      return;
    }

    const target = `${conn.baseUrl}/${subPath}${query ? `?${query}` : ""}`;
    // Containment: the resolved URL must stay under the configured base.
    if (!new URL(target).href.startsWith(new URL(conn.baseUrl).href)) {
      return res.status(400).json({ error: "path escapes the connection base" });
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    const text = await upstream.text();
    res
      .status(upstream.status)
      .type(upstream.headers.get("content-type") || "application/json")
      .send(text);
  } catch (err) {
    res.status(502).json({ error: `proxy failed: ${String(err?.message ?? err)}` });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Cortex API listening on http://localhost:${PORT}`);
  console.log(`sqlite file: ${DB_PATH}`);
  console.log(TOKEN ? "auth: bearer token required" : "auth: OPEN (set CORTEX_TOKEN to protect)");
});
