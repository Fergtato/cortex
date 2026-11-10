import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Runtime configuration, all from env vars, with defaults that make a bare
 * `docker run -v cortex-data:/data` work: SQLite + local files in DATA_DIR and
 * a generated secret persisted next to them.
 */
const env = process.env;

export const DATA_DIR = resolve(env.DATA_DIR ?? "./data");
mkdirSync(DATA_DIR, { recursive: true });

function loadSecret(): string {
  if (env.CORTEX_SECRET) return env.CORTEX_SECRET;
  const file = join(DATA_DIR, "secret");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const s = randomBytes(32).toString("base64url");
  writeFileSync(file, s, { mode: 0o600 });
  return s;
}

export const config = {
  port: Number(env.PORT ?? 8080),
  dataDir: DATA_DIR,
  /** Postgres connection string; unset = SQLite at DATA_DIR/cortex.db. */
  databaseUrl: env.DATABASE_URL || undefined,
  secret: loadSecret(),
  /** Public URL, e.g. https://cortex.example.com. Unset = trust the request's own origin (LAN installs). */
  publicUrl: env.CORTEX_URL || undefined,
  /** Hosted mode: anyone may create an account. Self-host default: only the first (admin) sign-up. */
  allowSignup: env.ALLOW_SIGNUP === "true",
  /** Built SPA to serve; unset in dev (Vite serves it). */
  webDist: env.WEB_DIST ? resolve(env.WEB_DIST) : undefined,
  maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024,
  /**
   * Whether API connections may reach private networks (LAN, loopback,
   * link-local). Self-host default: allow (talking to home devices is the
   * point). Hosted (ALLOW_SIGNUP=true) default: deny, so users can't reach the
   * host's internal network. PROXY_PRIVATE_NETWORKS=allow|deny overrides.
   */
  proxyPrivateNetworks: (env.PROXY_PRIVATE_NETWORKS === "allow" || env.PROXY_PRIVATE_NETWORKS === "deny"
    ? env.PROXY_PRIVATE_NETWORKS
    : env.ALLOW_SIGNUP === "true"
      ? "deny"
      : "allow") as "allow" | "deny",
  version: env.CORTEX_VERSION ?? "2.0.0-dev",
};
