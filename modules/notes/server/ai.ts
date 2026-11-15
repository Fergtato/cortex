import type { Hono } from "hono";
import { z } from "zod";
import { AiError, type AppEnv, type ServerContext } from "@cortex/core/server";

/*
 * Notes AI: rewrite a selection or write new text from a request. The reply
 * streams back as plain text (Markdown); the editor previews it and the
 * person decides whether to insert it. If the provider fails mid-stream the
 * body ends with "\u0000ERROR:<message>" (read by streamText in @cortex/core).
 */

const body = z.object({
  mode: z.enum(["rewrite", "write"]),
  instruction: z.string().trim().min(1).max(1000),
  text: z.string().max(12_000).default(""),
  title: z.string().max(300).default(""),
  context: z.string().max(6000).default(""),
});

const SYSTEM = `You help write in a notes app called Cortex. Reply with only the text to put in the note, in simple Markdown: paragraphs, headings (#, ##, ###), bullet or numbered lists, task lists ("- [ ] item"), **bold**, *italic*, \`code\`, > quotes and links. No preamble, no explanations, no closing remarks, and don't wrap the reply in a code fence. Match the language of the note unless asked to translate.`;

function prompt(b: z.infer<typeof body>) {
  const ctxBlock = [b.title && `Page title: ${b.title}`, b.context && `Nearby text from the page (for context only, don't repeat it):\n"""\n${b.context}\n"""`].filter(Boolean).join("\n\n");
  if (b.mode === "rewrite") {
    return `Mode: rewrite\nInstruction: ${b.instruction}\n\nApply the instruction to this text and return only the new version. Keep the meaning unless the instruction says otherwise. If the text is a fragment of a sentence, return a fragment that fits in its place.\n"""\n${b.text}\n"""${ctxBlock ? `\n\n${ctxBlock}` : ""}`;
  }
  return `Mode: write\nRequest: ${b.instruction}\n\nWrite what's asked, ready to insert at the cursor.${ctxBlock ? `\n\n${ctxBlock}` : ""}`;
}

export function addAiRoutes(app: Hono<AppEnv>, ctx: ServerContext) {
  app.post("/ai", async (c) => {
    const p = body.safeParse(await c.req.json().catch(() => null));
    if (!p.success) return c.json({ error: p.error.issues[0]?.message ?? "Invalid request" }, 400);
    if (p.data.mode === "rewrite" && !p.data.text.trim()) return c.json({ error: "Select some text first." }, 400);
    const abort = new AbortController();
    c.req.raw.signal?.addEventListener("abort", () => abort.abort(), { once: true });
    const it = ctx.ai.stream(c.get("userId"), { system: SYSTEM, messages: [{ role: "user", content: prompt(p.data) }], maxTokens: 3000, temperature: 0.5 }, abort.signal)[Symbol.asyncIterator]();
    // Wait for the first piece so setup errors (no AI, bad key) come back as a normal error response.
    let first: IteratorResult<string>;
    try {
      first = await it.next();
    } catch (e) {
      if (e instanceof AiError) return c.json({ error: e.message }, e.status as 400);
      throw e;
    }
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!first.done && first.value) controller.enqueue(enc.encode(first.value));
          if (!first.done) {
            for (;;) {
              const n = await it.next();
              if (n.done) break;
              if (n.value) controller.enqueue(enc.encode(n.value));
            }
          }
        } catch (e) {
          if (!abort.signal.aborted) controller.enqueue(enc.encode(`\u0000ERROR:${e instanceof AiError ? e.message : "The AI stopped unexpectedly."}`));
        }
        controller.close();
      },
      cancel() {
        abort.abort();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } });
  });
}
