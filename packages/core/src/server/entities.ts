import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import { forUser, type AppEnv, type ServerContext } from "./index";

/*
 * "Entity store" tables: one row per client-side entity (a page, a database,
 * a dashboard…), the entity as JSON text, keyed (user_id, id). The web store
 * diffs against what it last saved and sends only changed/removed entities,
 * so an edit never rewrites the whole collection. Used by Notes and Home.
 */

const MAX_SYNC_BYTES = 50 * 1024 * 1024;

/** Migration creating one entity table. */
export function entityTable(name: string): Migration {
  return {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable(name)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("data", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${name}_pk`, ["user_id", "id"])
        .execute();
    },
  };
}

interface Delta {
  upserts?: Record<string, unknown>;
  deletes?: string[];
}

/**
 * Routes for a set of entity collections, e.g. `{ pages: "notes_pages" }`:
 *   GET  /      → { pages: { id: entity }, … }
 *   POST /sync  ← { pages?: { upserts, deletes }, … }   (one transaction)
 */
export function entityRoutes(ctx: ServerContext, collections: Record<string, string>) {
  const app = new Hono<AppEnv>();
  const entries = Object.entries(collections);

  app.get("/", async (c) => {
    const q = forUser(ctx.db, c.get("userId"));
    const out: Record<string, Record<string, unknown>> = {};
    for (const [key, table] of entries) {
      out[key] = {};
      for (const r of await q.selectFrom(table).select(["id", "data"]).execute()) out[key][r.id] = JSON.parse(r.data);
    }
    return c.json(out);
  });

  app.post("/sync", async (c) => {
    const text = await c.req.text();
    if (text.length > MAX_SYNC_BYTES) return c.json({ error: "Change too large" }, 413);
    let body: Record<string, Delta>;
    try {
      body = JSON.parse(text);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const uid = c.get("userId");
    const now = new Date().toISOString();
    await ctx.db.transaction().execute(async (trx) => {
      const q = forUser(trx, uid);
      for (const [key, table] of entries) {
        const delta = body[key];
        if (!delta) continue;
        for (const [id, entity] of Object.entries(delta.upserts ?? {})) {
          if (!id || id.length > 128) continue;
          const data = JSON.stringify(entity);
          await q
            .insertInto(table, { id, data, updated_at: now })
            .onConflict((oc) => oc.columns(["user_id", "id"]).doUpdateSet({ data, updated_at: now }))
            .execute();
        }
        const deletes = (delta.deletes ?? []).filter((d) => typeof d === "string");
        for (let i = 0; i < deletes.length; i += 500) {
          await q.deleteFrom(table).where("id", "in", deletes.slice(i, i + 500)).execute();
        }
      }
    });
    return c.json({ ok: true });
  });

  return app;
}
