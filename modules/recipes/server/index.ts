import { Hono } from "hono";
import type { Kysely } from "kysely";
import { z } from "zod";
import { forUser, newId, type AppEnv, type CortexServerModule, type ServerContext } from "@cortex/core/server";
import type { PlanEntry, Recipe, RecipeData } from "../shared/types";
import { findRecipe, mapRecipe } from "./import";

/*
 * Recipes. A recipe's queryable bits (title, favourite, cooking history) are
 * columns; the card itself (ingredients, steps, tags…) is one JSON `data`
 * column, validated here. The week plan is one row per planned meal.
 * Portable SQL only (SQLite + Postgres).
 */

const T = { recipes: "recipes_recipes", plan: "recipes_plan" } as const;

const now = () => new Date().toISOString();
const num = (v: unknown) => Number(v ?? 0);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ID = z.string().min(1).max(64);
const MIN = z.number().int().min(0).max(100_000).nullable();
const IMG = z.string().max(300).regex(/^(cortex-file:[\w-]+|art:[a-z-]+)?$/);

const ingredient = z.object({ id: ID, qty: z.number().min(0).max(1e6).nullable(), unit: z.string().max(40), name: z.string().max(200), note: z.string().max(300) });
const step = z.object({
  id: ID,
  title: z.string().max(200),
  text: z.string().max(5000),
  minutes: MIN,
  handsOff: z.boolean(),
  after: ID.nullable(),
  image: IMG.nullable(),
});
const recipeData = z.object({
  title: z.string().trim().min(1, "Give the recipe a name").max(200),
  subtitle: z.string().max(300),
  intro: z.string().max(3000),
  hero: IMG,
  heroFocus: z.number().min(0).max(100).default(50),
  servings: z.number().int().min(1).max(100),
  prepMin: MIN,
  cookMin: MIN,
  calories: z.number().int().min(0).max(100_000).nullable(),
  difficulty: z.enum(["", "easy", "medium", "hard"]),
  tags: z.array(z.string().trim().min(1).max(40)).max(40),
  ingredients: z.array(ingredient).max(200),
  equipment: z.array(z.string().max(120)).max(50),
  steps: z.array(step).max(100),
  notes: z.string().max(20_000),
  sourceUrl: z.string().max(2000),
});

const migrations = {
  "0001_init": {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable(T.recipes)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("data", "text", (c) => c.notNull())
        .addColumn("favourite", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("cook_count", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("last_cooked", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.recipes}_pk`, ["user_id", "id"])
        .execute();
      await db.schema
        .createTable(T.plan)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("date", "text", (c) => c.notNull())
        .addColumn("recipe_id", "text")
        .addColumn("note", "text", (c) => c.notNull())
        .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("created_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.plan}_pk`, ["user_id", "id"])
        .execute();
      await db.schema.createIndex(`${T.plan}_date_idx`).on(T.plan).columns(["user_id", "date"]).execute();
    },
  },
};

function toRecipe(r: any): Recipe {
  let data: Partial<RecipeData> = {};
  try {
    data = JSON.parse(r.data);
  } catch {
    /* a broken row still lists, with defaults */
  }
  return {
    title: r.title,
    subtitle: "",
    intro: "",
    hero: "",
    heroFocus: 50,
    servings: 2,
    prepMin: null,
    cookMin: null,
    calories: null,
    difficulty: "",
    tags: [],
    ingredients: [],
    equipment: [],
    steps: [],
    notes: "",
    sourceUrl: "",
    ...data,
    id: r.id,
    favourite: !!num(r.favourite),
    cookCount: num(r.cook_count),
    lastCooked: r.last_cooked ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const toPlan = (r: any): PlanEntry => ({ id: r.id, date: r.date, recipeId: r.recipe_id ?? null, note: r.note, sort: num(r.sort) });

function routes(ctx: ServerContext) {
  const app = new Hono<AppEnv>();
  const q = (c: { get: (k: "userId") => string }) => forUser(ctx.db, c.get("userId"));
  const bad = (c: any, msg: string) => c.json({ error: msg }, 400);
  const parseData = (body: unknown) => {
    const r = recipeData.safeParse(body);
    if (!r.success) return { error: r.error.issues[0]?.message ?? "Invalid recipe" } as const;
    const d = r.data;
    // Dedupe tags case-insensitively, keeping the first spelling.
    const seen = new Set<string>();
    d.tags = d.tags.filter((t) => !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
    return { data: d } as const;
  };

  app.get("/recipes", async (c) => {
    const rows = await q(c).selectFrom(T.recipes).selectAll().orderBy("updated_at", "desc").execute();
    return c.json({ recipes: rows.map(toRecipe) });
  });

  app.post("/recipes", async (c) => {
    const p = parseData(await c.req.json().catch(() => null));
    if ("error" in p) return bad(c, p.error!);
    const id = newId();
    const t = now();
    await q(c).insertInto(T.recipes, { id, title: p.data.title, data: JSON.stringify(p.data), favourite: 0, cook_count: 0, last_cooked: null, created_at: t, updated_at: t }).execute();
    const row = await q(c).selectFrom(T.recipes).selectAll().where("id", "=", id).executeTakeFirst();
    return c.json(toRecipe(row), 201);
  });

  app.put("/recipes/:id", async (c) => {
    const p = parseData(await c.req.json().catch(() => null));
    if ("error" in p) return bad(c, p.error!);
    const id = c.req.param("id");
    const res = await q(c).updateTable(T.recipes).set({ title: p.data.title, data: JSON.stringify(p.data), updated_at: now() }).where("id", "=", id).executeTakeFirst();
    if (!num(res.numUpdatedRows)) return c.json({ error: "Not found" }, 404);
    const row = await q(c).selectFrom(T.recipes).selectAll().where("id", "=", id).executeTakeFirst();
    return c.json(toRecipe(row));
  });

  // Favourite and cooking history change without touching the card (or its updated_at).
  app.patch("/recipes/:id", async (c) => {
    const b = z
      .object({ favourite: z.boolean().optional(), cooked: z.literal(true).optional(), uncook: z.literal(true).optional(), date: DATE.optional() })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Invalid change");
    const id = c.req.param("id");
    const row: any = await q(c).selectFrom(T.recipes).selectAll().where("id", "=", id).executeTakeFirst();
    if (!row) return c.json({ error: "Not found" }, 404);
    const set: Record<string, unknown> = {};
    if (b.data.favourite !== undefined) set.favourite = b.data.favourite ? 1 : 0;
    if (b.data.cooked) {
      set.cook_count = num(row.cook_count) + 1;
      set.last_cooked = b.data.date ?? now().slice(0, 10);
    }
    if (b.data.uncook) set.cook_count = Math.max(0, num(row.cook_count) - 1);
    if (Object.keys(set).length) await q(c).updateTable(T.recipes).set(set).where("id", "=", id).execute();
    return c.json(toRecipe({ ...row, ...set }));
  });

  app.delete("/recipes/:id", async (c) => {
    const id = c.req.param("id");
    await q(c).deleteFrom(T.recipes).where("id", "=", id).execute();
    await q(c).deleteFrom(T.plan).where("recipe_id", "=", id).execute();
    return c.body(null, 204);
  });

  // ---- import from a web page (schema.org JSON-LD). Returns a draft; nothing is saved but the photo.
  app.post("/import", async (c) => {
    const b = z.object({ url: z.string().trim().url().max(2000) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success || !/^https?:\/\//i.test(b.data.url)) return bad(c, "Paste a full link, starting with https://");
    const ua = { "user-agent": "Mozilla/5.0 (compatible; Cortex recipe import)", accept: "text/html,application/xhtml+xml" };
    let html: string;
    try {
      const res = await ctx.outbound(b.data.url, ua);
      if (res.status >= 400) return c.json({ error: `That site answered ${res.status}. Some sites block imports; try another link.` }, 502);
      html = res.text();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      return c.json({ error: /private/.test(msg) ? "That address isn't allowed." : /large/.test(msg) ? "That page is too big to read." : "Couldn't reach that page." }, 502);
    }
    const node = findRecipe(html);
    if (!node) return c.json({ error: "No recipe found on that page. Cortex reads the recipe data most recipe sites include; this one doesn't seem to." }, 422);
    const { draft, imageUrl } = mapRecipe(node, b.data.url);
    if (imageUrl) {
      try {
        const img = await ctx.outbound(imageUrl, { "user-agent": ua["user-agent"], accept: "image/*" });
        const type = String(img.headers["content-type"] ?? "").split(";")[0].trim();
        if (img.status < 400 && /^image\/(jpeg|png|webp|gif|avif)$/.test(type)) {
          const id = await ctx.files.save(c.get("userId"), img.bytes(), `${draft.title.slice(0, 80)}.${type.split("/")[1]}`, type);
          draft.hero = `cortex-file:${id}`;
        }
      } catch {
        /* no photo: the placeholder stands in */
      }
    }
    return c.json(draft);
  });

  // ---- week plan
  app.get("/plan", async (c) => {
    const from = DATE.safeParse(c.req.query("from"));
    const to = DATE.safeParse(c.req.query("to"));
    if (!from.success || !to.success) return bad(c, "Expected ?from=YYYY-MM-DD&to=YYYY-MM-DD");
    const rows = await q(c).selectFrom(T.plan).selectAll().where("date", ">=", from.data).where("date", "<=", to.data).orderBy("date").orderBy("sort").execute();
    return c.json(rows.map(toPlan));
  });

  app.post("/plan", async (c) => {
    const b = z.object({ date: DATE, recipeId: ID.nullable(), note: z.string().max(200).default("") }).safeParse(await c.req.json().catch(() => null));
    if (!b.success || (!b.data.recipeId && !b.data.note.trim())) return bad(c, "Expected a recipe or a note");
    const u = q(c);
    if (b.data.recipeId && !(await u.selectFrom(T.recipes).select("id").where("id", "=", b.data.recipeId).executeTakeFirst())) return c.json({ error: "Recipe not found" }, 404);
    const last: any = await u.selectFrom(T.plan).select((eb) => eb.fn.max("sort").as("m")).where("date", "=", b.data.date).executeTakeFirst();
    const entry = { id: newId(), date: b.data.date, recipe_id: b.data.recipeId, note: b.data.note.trim(), sort: num(last?.m) + 1, created_at: now() };
    await u.insertInto(T.plan, entry).execute();
    return c.json(toPlan(entry), 201);
  });

  app.patch("/plan/:id", async (c) => {
    const b = z.object({ date: DATE.optional(), note: z.string().max(200).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Invalid change");
    const set: Record<string, unknown> = {};
    if (b.data.date) {
      set.date = b.data.date;
      const last: any = await q(c).selectFrom(T.plan).select((eb) => eb.fn.max("sort").as("m")).where("date", "=", b.data.date).executeTakeFirst();
      set.sort = num(last?.m) + 1;
    }
    if (b.data.note !== undefined) set.note = b.data.note.trim();
    if (Object.keys(set).length) await q(c).updateTable(T.plan).set(set).where("id", "=", c.req.param("id")).execute();
    return c.body(null, 204);
  });

  app.delete("/plan/:id", async (c) => {
    await q(c).deleteFrom(T.plan).where("id", "=", c.req.param("id")).execute();
    return c.body(null, 204);
  });

  // ---- backup (Settings → Backup)
  app.get("/backup", async (c) => {
    const u = q(c);
    const strip = (rows: any[]) => rows.map(({ user_id: _u, ...rest }) => rest);
    return c.json({ recipes: strip(await u.selectFrom(T.recipes).selectAll().execute()), plan: strip(await u.selectFrom(T.plan).selectAll().execute()) });
  });

  app.post("/backup", async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || (b.mode !== "merge" && b.mode !== "replace") || typeof b.data !== "object") return bad(c, "Expected { mode, data }");
    const uid = c.get("userId");
    const counts: Record<string, number> = {};
    const cols: Record<string, string[]> = {
      recipes: ["id", "title", "data", "favourite", "cook_count", "last_cooked", "created_at", "updated_at"],
      plan: ["id", "date", "recipe_id", "note", "sort", "created_at"],
    };
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      if (b.mode === "replace") for (const table of Object.values(T)) await u.deleteFrom(table).execute();
      for (const key of ["recipes", "plan"] as const) {
        const rows = Array.isArray(b.data[key]) ? b.data[key] : [];
        counts[key] = rows.length;
        for (const row of rows) {
          if (!row || typeof row !== "object" || typeof row.id !== "string") continue;
          const values = Object.fromEntries(cols[key].map((k) => [k, row[k] ?? null]));
          if (key === "recipes" && (typeof values.title !== "string" || typeof values.data !== "string")) continue;
          if (key === "plan" && typeof values.date !== "string") continue;
          values.created_at ??= now();
          if (key === "recipes") Object.assign(values, { favourite: values.favourite ?? 0, cook_count: values.cook_count ?? 0, updated_at: values.updated_at ?? values.created_at });
          if (key === "plan") Object.assign(values, { note: values.note ?? "", sort: values.sort ?? 0 });
          await u.deleteFrom(T[key]).where("id", "=", row.id).execute();
          await u.insertInto(T[key], values).execute();
        }
      }
    });
    return c.json({ ok: true, counts });
  });

  return app;
}

export const recipesServer: CortexServerModule = { id: "recipes", migrations, routes };
