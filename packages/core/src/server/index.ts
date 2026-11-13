import type { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";

export * from "../shared";

/** Hono env for module routers: auth middleware has already set `userId`. */
export type AppEnv = {
  Variables: {
    userId: string;
    userRole: string;
  };
};

export interface ServerContext {
  db: Kysely<any>;
  dialect: "sqlite" | "postgres";
  /** Persistent data directory (the Docker volume). */
  dataDir: string;
  /** AES-GCM with a key derived from CORTEX_SECRET, for secrets modules store (API keys). */
  secrets: { encrypt: (plain: string) => string; decrypt: (stored: string) => string };
  /**
   * GET a URL the person supplied (a Plex server) or a public API, under the
   * same private-network policy as /api/proxy (enforced in the socket's DNS
   * lookup, so no rebinding window). Never use fetch() for user-given URLs.
   */
  outbound: (url: string, headers?: Record<string, string>) => Promise<OutboundResponse>;
}

export interface OutboundResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: () => string;
  json: <T = unknown>() => T;
}

/** A recurring background job (connector syncs, reminders, cleanups). */
export interface JobDef {
  /** Unique within the module; the scheduler namespaces it as `<module>.<id>`. */
  id: string;
  everyMinutes: number;
  run: (ctx: ServerContext) => Promise<void>;
}

/**
 * The server half of a Cortex module.
 *
 * - `migrations`: Kysely migrations keyed `0001_name`, `0002_name`…; the server
 *   prefixes them with the module id, so modules never collide. Use only SQL
 *   that runs on BOTH SQLite and Postgres (see `docs/v2-architecture.md`).
 * - `routes`: mounted at `/api/<id>`, behind the auth middleware.
 */
export interface CortexServerModule {
  id: string;
  migrations?: Record<string, Migration>;
  routes?: (ctx: ServerContext) => Hono<AppEnv>;
  jobs?: JobDef[];
}

/**
 * Per-user query helpers: the stand-in for Postgres RLS. Every table holding
 * user data has a `user_id` column, and module code reaches it only through
 * these so a missing `where user_id = ?` can't leak another person's rows.
 */
export function forUser(db: Kysely<any>, userId: string) {
  return {
    selectFrom: (table: string) => db.selectFrom(table).where(`${table}.user_id` as any, "=", userId),
    insertInto: (table: string, values: Record<string, unknown> | Record<string, unknown>[]) =>
      db
        .insertInto(table)
        .values((Array.isArray(values) ? values : [values]).map((v) => ({ ...v, user_id: userId }))),
    updateTable: (table: string) => db.updateTable(table).where("user_id" as any, "=", userId),
    deleteFrom: (table: string) => db.deleteFrom(table).where("user_id" as any, "=", userId),
  };
}
export * from "./entities";
