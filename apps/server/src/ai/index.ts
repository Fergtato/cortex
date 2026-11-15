import { Hono } from "hono";
import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import { z } from "zod";
import { AI_PRESETS, AiError, newId, type AiConnection, type AiRequest, type AiService, type AiStatus, type AppEnv, type ServerContext } from "@cortex/core/server";
import { decryptToken, encryptToken } from "../connections";
import { complete, listModels, stream, type ResolvedAi, type Transport } from "./providers";

/*
 * Bring-your-own AI. Each person can connect providers in Settings → AI; an
 * admin can share one connection that anyone without their own uses. Keys
 * are encrypted with CORTEX_SECRET and never leave the server. Modules use
 * `ctx.ai` and keep their prompts server-side.
 */

const T = "ai_connections";

export const aiMigration: Migration = {
  async up(db: Kysely<any>) {
    await db.schema
      .createTable(T)
      .addColumn("user_id", "text", (c) => c.notNull())
      .addColumn("id", "text", (c) => c.notNull())
      .addColumn("name", "text", (c) => c.notNull())
      .addColumn("preset", "text", (c) => c.notNull())
      .addColumn("kind", "text", (c) => c.notNull())
      .addColumn("base_url", "text", (c) => c.notNull())
      .addColumn("api_key", "text", (c) => c.notNull())
      .addColumn("model", "text", (c) => c.notNull())
      .addColumn("is_default", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("shared", "integer", (c) => c.notNull().defaultTo(0))
      .addColumn("created_at", "text", (c) => c.notNull())
      .addColumn("updated_at", "text", (c) => c.notNull())
      .addPrimaryKeyConstraint(`${T}_pk`, ["user_id", "id"])
      .execute();
  },
};

const num = (v: unknown) => Number(v ?? 0);
const now = () => new Date().toISOString();

function toConnection(r: any, uid: string): AiConnection {
  return {
    id: r.id,
    name: r.name,
    preset: r.preset,
    kind: r.kind,
    baseUrl: r.base_url,
    model: r.model,
    hasKey: !!r.api_key,
    isDefault: !!num(r.is_default),
    shared: !!num(r.shared),
    readOnly: r.user_id !== uid,
  };
}

const resolved = (r: any): ResolvedAi => ({ kind: r.kind, baseUrl: r.base_url, apiKey: r.api_key ? decryptToken(r.api_key) : "", model: r.model });

/** The connection a person's AI requests use: their default, any of theirs, then a shared one. */
async function pick(db: Kysely<any>, uid: string): Promise<any | null> {
  const own = await db.selectFrom(T).selectAll().where("user_id", "=", uid).orderBy("is_default", "desc").orderBy("created_at").executeTakeFirst();
  if (own) return own;
  return (await db.selectFrom(T).selectAll().where("shared", "=", 1).orderBy("is_default", "desc").orderBy("created_at").executeTakeFirst()) ?? null;
}

/** Pulls a JSON value out of a reply that may be fenced or wrapped in prose. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : t;
  try {
    return JSON.parse(body);
  } catch {
    /* find the outermost object or array */
  }
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in the reply");
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  const end = body.lastIndexOf(close);
  if (end <= start) throw new Error("no JSON in the reply");
  return JSON.parse(body.slice(start, end + 1));
}

export function createAiService(db: Kysely<any>, t: Transport): AiService {
  const conn = async (uid: string) => {
    const row = await pick(db, uid);
    if (!row) throw new AiError("No AI is connected. Add one in Settings → AI.", 409);
    if (!row.model) throw new AiError("Choose a model for your AI connection in Settings → AI.", 409);
    return resolved(row);
  };
  const service: AiService = {
    complete: async (uid, req, signal) => complete(t, await conn(uid), req, signal),
    stream: (uid, req, signal) => ({
      async *[Symbol.asyncIterator]() {
        yield* stream(t, await conn(uid), req, signal);
      },
    }),
    json: async <R,>(uid: string, req: AiRequest, parse: (v: unknown) => R, signal?: AbortSignal): Promise<R> => {
      const ai = await conn(uid);
      const first = await complete(t, ai, { ...req, json: true }, signal);
      try {
        return parse(extractJson(first));
      } catch (e) {
        const why = e instanceof z.ZodError ? e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") : e instanceof Error ? e.message : "invalid";
        const retry = await complete(t, ai, { ...req, json: true, messages: [...req.messages, { role: "assistant", content: first.slice(0, 8000) }, { role: "user", content: `That reply wasn't valid (${why}). Send the corrected JSON only.` }] }, signal);
        try {
          return parse(extractJson(retry));
        } catch {
          throw new AiError("The AI's answer wasn't in the expected shape. Try again, or try a stronger model.");
        }
      }
    },
  };
  return service;
}

const URL_RE = z.string().trim().max(500).refine((s) => /^https?:\/\/[^\s]+$/i.test(s), "Enter an address starting with http:// or https://");

export function aiRouter(ctx: ServerContext, t: Transport) {
  const app = new Hono<AppEnv>();
  const db = ctx.db;
  const isAdmin = (c: any) => c.get("userRole") === "admin";
  const fail = (c: any, e: unknown) => {
    if (e instanceof AiError) return c.json({ error: e.message }, e.status as never);
    return c.json({ error: "Something went wrong talking to the AI." }, 500);
  };

  app.get("/status", async (c) => {
    const row = await pick(db, c.get("userId"));
    const status: AiStatus = { available: !!row?.model, connection: row ? { id: row.id, name: row.name, model: row.model, shared: row.user_id !== c.get("userId") } : null };
    return c.json(status);
  });

  app.get("/connections", async (c) => {
    const uid = c.get("userId");
    const rows = await db
      .selectFrom(T)
      .selectAll()
      .where((eb) => eb.or([eb("user_id", "=", uid), eb("shared", "=", 1)]))
      .orderBy("created_at")
      .execute();
    return c.json(rows.map((r) => toConnection(r, uid)));
  });

  const body = z.object({
    name: z.string().trim().max(60).optional(),
    preset: z.string().refine((p) => AI_PRESETS.some((x) => x.id === p), "Unknown provider"),
    baseUrl: URL_RE,
    apiKey: z.string().max(500).optional(),
    model: z.string().trim().max(200),
    isDefault: z.boolean().optional(),
    shared: z.boolean().optional(),
  });

  app.post("/connections", async (c) => {
    const p = body.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Invalid connection" }, 400);
    const uid = c.get("userId");
    const preset = AI_PRESETS.find((x) => x.id === p.data.preset)!;
    if (p.data.shared && !isAdmin(c)) return c.json({ error: "Only an admin can share a connection." }, 403);
    const count = num((await db.selectFrom(T).select((eb) => eb.fn.countAll().as("n")).where("user_id", "=", uid).executeTakeFirst())?.n);
    const isDefault = p.data.isDefault || count === 0;
    if (isDefault) await db.updateTable(T).set({ is_default: 0 }).where("user_id", "=", uid).execute();
    const id = newId();
    const t0 = now();
    await db
      .insertInto(T)
      .values({ user_id: uid, id, name: p.data.name || preset.label, preset: preset.id, kind: preset.kind, base_url: p.data.baseUrl.replace(/\/+$/, ""), api_key: p.data.apiKey ? encryptToken(p.data.apiKey.trim()) : "", model: p.data.model, is_default: isDefault ? 1 : 0, shared: p.data.shared ? 1 : 0, created_at: t0, updated_at: t0 })
      .execute();
    const row = await db.selectFrom(T).selectAll().where("user_id", "=", uid).where("id", "=", id).executeTakeFirst();
    return c.json(toConnection(row, uid), 201);
  });

  app.patch("/connections/:id", async (c) => {
    const p = body.partial().safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Invalid change" }, 400);
    const uid = c.get("userId");
    const id = c.req.param("id");
    const row = await db.selectFrom(T).selectAll().where("user_id", "=", uid).where("id", "=", id).executeTakeFirst();
    if (!row) return c.json({ error: "Not found" }, 404);
    if (p.data.shared && !isAdmin(c)) return c.json({ error: "Only an admin can share a connection." }, 403);
    const set: Record<string, unknown> = { updated_at: now() };
    if (p.data.name !== undefined) set.name = p.data.name || row.name;
    if (p.data.baseUrl !== undefined) set.base_url = p.data.baseUrl.replace(/\/+$/, "");
    if (p.data.model !== undefined) set.model = p.data.model;
    if (p.data.apiKey !== undefined) set.api_key = p.data.apiKey.trim() ? encryptToken(p.data.apiKey.trim()) : "";
    if (p.data.shared !== undefined) set.shared = p.data.shared ? 1 : 0;
    if (p.data.isDefault) {
      await db.updateTable(T).set({ is_default: 0 }).where("user_id", "=", uid).execute();
      set.is_default = 1;
    }
    await db.updateTable(T).set(set).where("user_id", "=", uid).where("id", "=", id).execute();
    const next = await db.selectFrom(T).selectAll().where("user_id", "=", uid).where("id", "=", id).executeTakeFirst();
    return c.json(toConnection(next, uid));
  });

  app.delete("/connections/:id", async (c) => {
    const uid = c.get("userId");
    const id = c.req.param("id");
    const row = await db.selectFrom(T).select("is_default").where("user_id", "=", uid).where("id", "=", id).executeTakeFirst();
    await db.deleteFrom(T).where("user_id", "=", uid).where("id", "=", id).execute();
    // Keep a default if any connection is left.
    if (row && num(row.is_default)) {
      const next = await db.selectFrom(T).select("id").where("user_id", "=", uid).orderBy("created_at").executeTakeFirst();
      if (next) await db.updateTable(T).set({ is_default: 1 }).where("user_id", "=", uid).where("id", "=", next.id).execute();
    }
    return c.body(null, 204);
  });

  /** Settings for a test or model list: a draft from the form, falling back to the saved key. */
  const draft = z.object({ id: z.string().optional(), preset: z.string(), baseUrl: URL_RE, apiKey: z.string().max(500).optional(), model: z.string().max(200).optional() });
  const fromDraft = async (c: any): Promise<ResolvedAi | Response> => {
    const p = draft.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Invalid settings" }, 400);
    const preset = AI_PRESETS.find((x) => x.id === p.data.preset);
    if (!preset) return c.json({ error: "Unknown provider" }, 400);
    let apiKey = p.data.apiKey?.trim() ?? "";
    if (!apiKey && p.data.id) {
      const row = await db
        .selectFrom(T)
        .select("api_key")
        .where("id", "=", p.data.id)
        .where((eb) => eb.or([eb("user_id", "=", c.get("userId")), eb("shared", "=", 1)]))
        .executeTakeFirst();
      if (row?.api_key) apiKey = decryptToken(row.api_key);
    }
    return { kind: preset.kind, baseUrl: p.data.baseUrl.replace(/\/+$/, ""), apiKey, model: p.data.model ?? "" };
  };

  app.post("/models", async (c) => {
    const ai = await fromDraft(c);
    if (ai instanceof Response) return ai;
    try {
      return c.json({ models: await listModels(t, ai) });
    } catch (e) {
      return fail(c, e);
    }
  });

  app.post("/test", async (c) => {
    const ai = await fromDraft(c);
    if (ai instanceof Response) return ai;
    if (!ai.model) return c.json({ error: "Choose a model first." }, 400);
    const t0 = Date.now();
    try {
      const reply = await complete(t, ai, { messages: [{ role: "user", content: "Reply with just the word: ready" }], maxTokens: 400 });
      return c.json({ ok: true, reply: reply.trim().slice(0, 80), ms: Date.now() - t0 });
    } catch (e) {
      return fail(c, e);
    }
  });

  return app;
}
