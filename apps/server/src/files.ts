import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { Hono } from "hono";
import { newId } from "@cortex/core/server";
import type { AppEnv, ServerContext } from "@cortex/core/server";
import { config } from "./config";

const ID_RE = /^[0-9a-f-]{36}$/;
// Only these are rendered inline; everything else downloads.
const INLINE_TYPES = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|application\/pdf)$/;

/**
 * Per-user file storage (images in notes, recipe photos, outfit pictures).
 * Local disk under DATA_DIR/files/<user>/<id>. Entities store a
 * `cortex-file:<id>` ref; the browser loads `/api/files/<id>` with the session
 * cookie. An S3 driver can implement the same three operations later.
 */
export function filesRouter(ctx: ServerContext) {
  const root = join(ctx.dataDir, "files");
  const pathFor = (uid: string, id: string) => join(root, uid, id);
  const app = new Hono<AppEnv>();

  app.post("/", async (c) => {
    const uid = c.get("userId");
    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "Expected a multipart `file` field" }, 400);
    if (file.size > config.maxUploadBytes) return c.json({ error: "File too large" }, 413);
    const id = newId();
    await mkdir(join(root, uid), { recursive: true });
    await writeFile(pathFor(uid, id), Buffer.from(await file.arrayBuffer()));
    await ctx.db
      .insertInto("files")
      .values({
        id,
        user_id: uid,
        name: file.name.slice(0, 255) || "file",
        type: file.type || "application/octet-stream",
        size: file.size,
        created_at: new Date().toISOString(),
      })
      .execute();
    return c.json({ id }, 201);
  });

  app.get("/:id", async (c) => {
    const uid = c.get("userId");
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.notFound();
    const row = await ctx.db
      .selectFrom("files")
      .selectAll()
      .where("id", "=", id)
      .where("user_id", "=", uid)
      .executeTakeFirst();
    if (!row) return c.notFound();
    const p = pathFor(uid, id);
    const { size } = await stat(p);
    const inline = INLINE_TYPES.test(row.type);
    return new Response(Readable.toWeb(createReadStream(p)) as ReadableStream, {
      headers: {
        "content-type": inline ? row.type : "application/octet-stream",
        "content-length": String(size),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        // Uploads are same-origin: never let one run script (SVG/HTML).
        "content-security-policy": "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
        "x-content-type-options": "nosniff",
        // Ids are never reused, so the bytes behind one never change.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });

  app.delete("/:id", async (c) => {
    const uid = c.get("userId");
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.notFound();
    const res = await ctx.db.deleteFrom("files").where("id", "=", id).where("user_id", "=", uid).executeTakeFirst();
    if (!Number(res.numDeletedRows)) return c.notFound();
    await rm(pathFor(uid, id), { force: true });
    return c.body(null, 204);
  });

  return app;
}
