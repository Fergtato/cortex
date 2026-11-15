import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import type { AppEnv, InstanceInfo, ServerContext } from "@cortex/core/server";
import { countUsers, createAuth, migrateAuth } from "./auth";
import { config } from "./config";
import { aiRouter, createAiService } from "./ai";
import { connectionsRouter, decryptToken, encryptToken, openUpstream, proxyRouter, upstreamRequest } from "./connections";
import { createDb } from "./db";
import { filesRouter, saveUserFile } from "./files";
import { startJobs } from "./jobs";
import { migrate } from "./migrate";
import { SERVER_MODULES } from "./modules";
import { settingsRouter } from "./settings";

const { db, dialect } = createDb();
const headersFor = (headers: Record<string, string>, body?: Buffer) => ({ "user-agent": "Cortex", ...headers, ...(body ? { "content-length": String(body.length) } : {}) });
const checkUrl = (url: string) => {
  const target = new URL(url);
  if (target.protocol !== "http:" && target.protocol !== "https:") throw new Error("Only http and https URLs are allowed.");
  return target;
};
const outbound: ServerContext["outbound"] = async (url, headers = {}, init = {}) => {
  const target = checkUrl(url);
  const body = init.body !== undefined ? Buffer.from(init.body) : undefined;
  const res = await upstreamRequest(target, { method: init.method ?? "GET", headers: headersFor(headers, body), body, timeoutMs: init.timeoutMs, signal: init.signal });
  const text = () => res.body.toString("utf8");
  return { status: res.status, headers: res.headers, text, json: <T,>() => JSON.parse(text()) as T, bytes: () => new Uint8Array(res.body) };
};
const outboundStream: ServerContext["outboundStream"] = async (url, headers = {}, init = {}) => {
  const target = checkUrl(url);
  const body = init.body !== undefined ? Buffer.from(init.body) : undefined;
  const { status, headers: h, res } = await openUpstream(target, { method: init.method ?? "GET", headers: headersFor(headers, body), body, timeoutMs: init.timeoutMs, signal: init.signal });
  return { status, headers: h, chunks: res as AsyncIterable<Uint8Array> };
};
const aiTransport = { request: outbound, stream: outboundStream };
const ctx: ServerContext = {
  db,
  dialect,
  dataDir: config.dataDir,
  secrets: { encrypt: encryptToken, decrypt: decryptToken },
  outbound,
  outboundStream,
  ai: createAiService(db, aiTransport),
  files: { save: (uid, data, name, type) => saveUserFile(db, config.dataDir, uid, data, name, type) },
};
const auth = createAuth(db, dialect);

await migrateAuth(auth);
await migrate(db, SERVER_MODULES);

const app = new Hono<AppEnv>();

// ---- public ----
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/instance", async (c) => {
  const info: InstanceInfo = {
    needsSetup: (await countUsers(db)) === 0,
    allowSignup: config.allowSignup,
    version: config.version,
  };
  return c.json(info);
});

app.get("/api/health", (c) => c.json({ ok: true }));

// ---- everything else under /api needs a session ----
app.use("/api/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Not signed in" }, 401);
  c.set("userId", session.user.id);
  c.set("userRole", (session.user as { role?: string }).role ?? "user");
  await next();
});

app.route("/api/settings", settingsRouter(ctx));
app.route("/api/files", filesRouter(ctx));
app.route("/api/connections", connectionsRouter(ctx));
app.route("/api/proxy", proxyRouter(ctx));
app.route("/api/ai", aiRouter(ctx, aiTransport));
for (const mod of SERVER_MODULES) {
  if (mod.routes) app.route(`/api/${mod.id}`, mod.routes(ctx));
}
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// ---- the SPA (production; in dev Vite serves it and proxies /api here) ----
if (config.webDist) {
  const root = config.webDist;
  const indexHtml = readFileSync(join(root, "index.html"), "utf8");
  app.use(
    "/assets/*",
    serveStatic({
      root,
      onFound: (_p, c) => c.header("cache-control", "public, max-age=31536000, immutable"),
    }),
  );
  app.use("*", serveStatic({ root }));
  // Deep links (/notes/…, /finance/…) all load the app shell.
  app.get("*", (c) => {
    c.header("cache-control", "no-cache");
    return c.html(indexHtml);
  });
}

const stopJobs = startJobs(ctx, SERVER_MODULES);
const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[cortex] listening on :${info.port} (${dialect}, data in ${config.dataDir})`);
});

const shutdown = () => {
  stopJobs();
  server.close();
  void db.destroy().finally(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
