import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import { forUser, type AppEnv, type ServerContext } from "@cortex/core/server";
import { config } from "./config";

/*
 * API connections: a named external API (Homey, TMDB, a home server…) with a
 * base URL and an auth recipe. The token is encrypted at rest with a key
 * derived from CORTEX_SECRET and is never sent to the browser. Widgets call
 * the API through /api/proxy/<connection id>/<path>; the server injects the
 * credentials.
 *
 * auth: "none"   no credentials
 *       "bearer" Authorization: Bearer <token>
 *       "header" <authKey>: <token>
 *       "query"  ?<authKey>=<token>   (e.g. TMDB v3 api_key)
 */

export const AUTH_KINDS = ["none", "bearer", "header", "query"] as const;
type AuthKind = (typeof AUTH_KINDS)[number];

export const connectionsMigration: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable("connections")
      .addColumn("user_id", "text", (c) => c.notNull())
      .addColumn("id", "text", (c) => c.notNull())
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("base_url", "text", (c) => c.notNull())
      .addColumn("auth", "text", (c) => c.notNull())
      .addColumn("auth_key", "text", (c) => c.notNull())
      .addColumn("updated_at", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("connections_pk", ["user_id", "id"])
      .execute();
    await db.schema
      .createTable("connection_secrets")
      .addColumn("user_id", "text", (c) => c.notNull())
      .addColumn("connection_id", "text", (c) => c.notNull())
      .addColumn("token", "text", (c) => c.notNull())
      .addColumn("updated_at", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint("connection_secrets_pk", ["user_id", "connection_id"])
      .execute();
  },
};

// ---------------------------------------------------------------- crypto

const KEY = createHash("sha256").update(`cortex-connections:${config.secret}`).digest();

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64")}`;
}

export function decryptToken(stored: string): string {
  if (!stored.startsWith("v1:")) throw new Error("unknown token format");
  const raw = Buffer.from(stored.slice(3), "base64");
  const decipher = createDecipheriv("aes-256-gcm", KEY, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

// --------------------------------------------------- private-network guard

/** Loopback, private, link-local, CGNAT, unique-local and unspecified ranges. */
export function isPrivateAddress(addr: string): boolean {
  if (isIP(addr) === 4) {
    const [a, b] = addr.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = addr.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb)/.test(v6);
}

/**
 * A dns.lookup that refuses private addresses. Used as the socket's lookup,
 * so the address that is checked is the one connected to (no DNS-rebinding
 * window between a check and the request).
 */
function guardedLookup(
  hostname: string,
  options: { all?: boolean },
  cb: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
) {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) return cb(err, "", 0);
    const bad = addresses.find((a) => isPrivateAddress(a.address));
    if (bad) {
      const e = new Error(`blocked: ${hostname} resolves to a private address`) as NodeJS.ErrnoException;
      e.code = "EPRIVATE";
      return cb(e, "", 0);
    }
    if (options.all) return cb(null, addresses);
    cb(null, addresses[0].address, addresses[0].family);
  });
}

interface UpstreamResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

const MAX_RESPONSE = 5 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

/** One HTTP(S) request with the private-network policy applied; follows up to 3 redirects for GET/HEAD. */
export function upstreamRequest(
  target: URL,
  init: { method: string; headers: Record<string, string>; body?: Buffer },
  redirectsLeft = 3,
): Promise<UpstreamResponse> {
  const denyPrivate = config.proxyPrivateNetworks === "deny";
  if (denyPrivate && isIP(target.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(target.hostname.replace(/^\[|\]$/g, ""))) {
    return Promise.reject(Object.assign(new Error("blocked: private address"), { code: "EPRIVATE" }));
  }
  const mod = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      target,
      {
        method: init.method,
        headers: init.headers,
        timeout: TIMEOUT_MS,
        ...(denyPrivate ? { lookup: guardedLookup as never } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && redirectsLeft > 0 && (init.method === "GET" || init.method === "HEAD")) {
          res.resume();
          let next: URL;
          try {
            next = new URL(location, target);
          } catch {
            return reject(new Error("bad redirect"));
          }
          if (next.protocol !== "http:" && next.protocol !== "https:") return reject(new Error("bad redirect"));
          return resolve(upstreamRequest(next, init, redirectsLeft - 1));
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_RESPONSE) {
            req.destroy(new Error("response too large"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("upstream timed out")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

// ---------------------------------------------------------------- routes

interface ConnectionRow {
  id: string;
  name: string;
  base_url: string;
  auth: AuthKind;
  auth_key: string;
}

function validBaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/\/+$/, "");
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

export function connectionsRouter(ctx: ServerContext) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const q = forUser(ctx.db, c.get("userId"));
    const rows = (await q.selectFrom("connections").select(["id", "name", "base_url", "auth", "auth_key"]).orderBy("name").execute()) as ConnectionRow[];
    const secrets = new Set((await q.selectFrom("connection_secrets").select("connection_id").execute()).map((r) => r.connection_id));
    return c.json(rows.map((r) => ({ id: r.id, name: r.name, baseUrl: r.base_url, auth: r.auth, authKey: r.auth_key, hasToken: secrets.has(r.id) })));
  });

  /** Create or update. `token` absent = keep, "" = clear, string = set. */
  app.put("/:id", async (c) => {
    const uid = c.get("userId");
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => null);
    if (!body || !/^[\w-]{1,64}$/.test(id)) return c.json({ error: "Invalid request" }, 400);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
    const baseUrl = validBaseUrl(body.baseUrl);
    const auth = AUTH_KINDS.includes(body.auth) ? (body.auth as AuthKind) : null;
    const authKey = typeof body.authKey === "string" ? body.authKey.trim().slice(0, 200) : "";
    if (!name || !baseUrl || !auth) return c.json({ error: "Name, an http(s) base URL and an auth type are required" }, 400);
    const now = new Date().toISOString();
    await ctx.db.transaction().execute(async (trx) => {
      const t = forUser(trx, uid);
      await t
        .insertInto("connections", { id, name, base_url: baseUrl, auth, auth_key: authKey, updated_at: now })
        .onConflict((oc) => oc.columns(["user_id", "id"]).doUpdateSet({ name, base_url: baseUrl, auth, auth_key: authKey, updated_at: now }))
        .execute();
      if (typeof body.token === "string") {
        await t.deleteFrom("connection_secrets").where("connection_id", "=", id).execute();
        if (body.token) await t.insertInto("connection_secrets", { connection_id: id, token: encryptToken(body.token), updated_at: now }).execute();
      }
    });
    return c.json({ ok: true });
  });

  app.delete("/:id", async (c) => {
    const q = forUser(ctx.db, c.get("userId"));
    const id = c.req.param("id");
    await q.deleteFrom("connection_secrets").where("connection_id", "=", id).execute();
    await q.deleteFrom("connections").where("id", "=", id).execute();
    return c.body(null, 204);
  });

  return app;
}

/** /api/proxy/<connection id>/<path>?<query>: forwards to the connection with credentials injected. */
export function proxyRouter(ctx: ServerContext) {
  const app = new Hono<AppEnv>();
  app.all("/:id/*", async (c) => {
    const uid = c.get("userId");
    const id = c.req.param("id");
    const q = forUser(ctx.db, uid);
    const conn = (await q.selectFrom("connections").select(["id", "base_url", "auth", "auth_key"]).where("id", "=", id).executeTakeFirst()) as
      | ConnectionRow
      | undefined;
    if (!conn) return c.json({ error: "Unknown connection" }, 404);
    const secret = await q.selectFrom("connection_secrets").select("token").where("connection_id", "=", id).executeTakeFirst();
    let token = "";
    try {
      token = secret ? decryptToken(secret.token) : "";
    } catch {
      return c.json({ error: "Stored token can't be decrypted (was CORTEX_SECRET changed?)" }, 500);
    }

    const reqUrl = new URL(c.req.url);
    const prefix = `/api/proxy/${encodeURIComponent(id)}/`;
    const subPath = reqUrl.pathname.startsWith(prefix) ? reqUrl.pathname.slice(prefix.length) : "";
    const params = new URLSearchParams(reqUrl.search);
    if (conn.auth === "query" && conn.auth_key && token) params.set(conn.auth_key, token);
    const query = params.toString();

    const base = conn.base_url.replace(/\/+$/, "");
    let target: URL;
    try {
      target = new URL(`${base}/${subPath}${query ? `?${query}` : ""}`);
      // Containment: ".." in the path must not climb out of the base.
      if (!target.href.startsWith(new URL(base).href)) return c.json({ error: "Path escapes the connection base" }, 400);
    } catch {
      return c.json({ error: "Invalid upstream URL" }, 400);
    }

    const headers: Record<string, string> = { accept: c.req.header("accept") ?? "application/json", "user-agent": "Cortex" };
    if (conn.auth === "bearer" && token) headers.authorization = `Bearer ${token}`;
    else if (conn.auth === "header" && conn.auth_key && token) headers[conn.auth_key.toLowerCase()] = token;
    let body: Buffer | undefined;
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const buf = Buffer.from(await c.req.arrayBuffer());
      if (buf.length) {
        body = buf;
        headers["content-type"] = c.req.header("content-type") ?? "application/json";
        headers["content-length"] = String(buf.length);
      }
    }

    try {
      const up = await upstreamRequest(target, { method: c.req.method, headers, body });
      return new Response(new Uint8Array(up.body), {
        status: up.status,
        headers: {
          "content-type": String(up.headers["content-type"] ?? "application/json"),
          // Never let an upstream response run as a same-origin page.
          "content-security-policy": "sandbox; default-src 'none'",
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        },
      });
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      const status = err.code === "EPRIVATE" ? 403 : 502;
      return c.json({ error: err.code === "EPRIVATE" ? "This Cortex doesn't allow requests to private networks" : `Proxy failed: ${err.message}` }, status);
    }
  });
  return app;
}
