import { Hono } from "hono";
import type { Kysely } from "kysely";
import { forUser, type AppEnv, type CortexServerModule } from "@cortex/core/server";

/*
 * Notes storage: one row per page and per database (or database folder),
 * the entity as JSON text. The web store diffs against what it last saved
 * and sends only changed/removed entities, so an edit never rewrites the
 * whole workspace. Ids are generated client-side and unique per user.
 */

const COLLECTIONS = { pages: "notes_pages", databases: "notes_databases" } as const;
type Collection = keyof typeof COLLECTIONS;
const MAX_SYNC_BYTES = 50 * 1024 * 1024;

interface Delta {
  upserts?: Record<string, unknown>;
  deletes?: string[];
}

function entityTable(name: string) {
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

export const notesServer: CortexServerModule = {
  id: "notes",
  migrations: {
    "0001_pages": entityTable("notes_pages"),
    "0002_databases": entityTable("notes_databases"),
  },
  routes: (ctx) => {
    const app = new Hono<AppEnv>();

    /** Everything the signed-in person has: `{ pages: {id: Page}, databases: {id: DbItem} }`. */
    app.get("/", async (c) => {
      const q = forUser(ctx.db, c.get("userId"));
      const out: Record<Collection, Record<string, unknown>> = { pages: {}, databases: {} };
      for (const [key, table] of Object.entries(COLLECTIONS) as [Collection, string][]) {
        const rows = await q.selectFrom(table).select(["id", "data"]).execute();
        for (const r of rows) out[key][r.id] = JSON.parse(r.data);
      }
      return c.json(out);
    });

    /** Applies `{ pages?: Delta, databases?: Delta }` in one transaction. */
    app.post("/sync", async (c) => {
      const text = await c.req.text();
      if (text.length > MAX_SYNC_BYTES) return c.json({ error: "Change too large" }, 413);
      let body: Partial<Record<Collection, Delta>>;
      try {
        body = JSON.parse(text);
      } catch {
        return c.json({ error: "Invalid JSON" }, 400);
      }
      const uid = c.get("userId");
      const now = new Date().toISOString();
      await ctx.db.transaction().execute(async (trx) => {
        const q = forUser(trx, uid);
        for (const [key, table] of Object.entries(COLLECTIONS) as [Collection, string][]) {
          const delta = body[key];
          if (!delta) continue;
          for (const [id, entity] of Object.entries(delta.upserts ?? {})) {
            if (typeof id !== "string" || !id || id.length > 128) continue;
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
  },
};
