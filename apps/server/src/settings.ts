import { Hono } from "hono";
import type { AppEnv, ServerContext } from "@cortex/core/server";

const MAX_BYTES = 512 * 1024;

/** Per-user settings blob (theme, custom theme files, disabled modules). */
export function settingsRouter(ctx: ServerContext) {
  const app = new Hono<AppEnv>();

  app.get("/", async (c) => {
    const row = await ctx.db
      .selectFrom("user_settings")
      .select("data")
      .where("user_id", "=", c.get("userId"))
      .executeTakeFirst();
    return c.json(row ? JSON.parse(row.data) : {});
  });

  app.put("/", async (c) => {
    const text = await c.req.text();
    if (text.length > MAX_BYTES) return c.json({ error: "Settings too large" }, 413);
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return c.json({ error: "Expected an object" }, 400);
    const row = { user_id: c.get("userId"), data: JSON.stringify(data), updated_at: new Date().toISOString() };
    await ctx.db
      .insertInto("user_settings")
      .values(row)
      .onConflict((oc) => oc.column("user_id").doUpdateSet({ data: row.data, updated_at: row.updated_at }))
      .execute();
    return c.json(data);
  });

  return app;
}
