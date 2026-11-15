import { AiError, type AiKind, type AiRequest, type OutboundInit, type OutboundResponse, type OutboundStream } from "@cortex/core/server";

/*
 * Wire formats for AI providers. Three cover every preset:
 *   anthropic  Claude Messages API
 *   openai     OpenAI chat completions, also OpenRouter, Ollama, LM Studio and
 *              any OpenAI-compatible server
 *   gemini     Google generateContent
 * All traffic goes through the guarded outbound transport passed in.
 */

export interface ResolvedAi {
  kind: AiKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Transport {
  request: (url: string, headers: Record<string, string>, init: OutboundInit) => Promise<OutboundResponse>;
  stream: (url: string, headers: Record<string, string>, init: OutboundInit) => Promise<OutboundStream>;
}

const TIMEOUT = 120_000;
const base = (u: string) => u.replace(/\/+$/, "");
const isOpenAI = (u: string) => /^https:\/\/api\.openai\.com\b/.test(u);

/** Turns a failed provider response into a message fit for the person. */
function httpError(status: number, body: string): AiError {
  let detail = "";
  try {
    const j = JSON.parse(body);
    detail = j?.error?.message ?? j?.message ?? (typeof j?.error === "string" ? j.error : "");
  } catch {
    detail = body.slice(0, 200);
  }
  if (status === 401 || status === 403) return new AiError(`The AI provider rejected the key${detail ? `: ${detail}` : "."}`, 400);
  if (status === 404) return new AiError(`Not found at that address or model${detail ? `: ${detail}` : "."}`, 400);
  if (status === 429) return new AiError("The AI provider is rate limiting requests. Try again in a moment.", 429);
  return new AiError(`The AI provider returned an error (${status})${detail ? `: ${detail}` : "."}`);
}

/** Network failures (refused, DNS, timeout, private address) as readable messages. */
export function netError(e: unknown, url: string): AiError {
  if (e instanceof AiError) return e;
  const err = e as NodeJS.ErrnoException;
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep raw */
  }
  if (err?.code === "ABORT") return new AiError("Cancelled.", 499);
  if (err?.code === "EPRIVATE" || /private/.test(err?.message ?? "")) return new AiError("This server doesn't allow connections to private network addresses.", 400);
  if (err?.code === "ECONNREFUSED") return new AiError(`Couldn't connect to ${host}. Is it running? From Docker, use your computer's LAN IP instead of localhost.`, 502);
  if (err?.code === "ENOTFOUND" || err?.code === "EAI_AGAIN") return new AiError(`Couldn't find ${host}.`, 502);
  if (/timed out/.test(err?.message ?? "")) return new AiError("The AI provider took too long to answer.", 504);
  return new AiError(`Couldn't reach the AI provider${err?.message ? ` (${err.message})` : ""}.`, 502);
}

const JSON_HINT = "Reply with a single JSON object only: no prose, no code fences.";

interface Call {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  /** Text from a whole response. */
  text: (j: any) => string;
  /** Text delta from one SSE `data:` payload ("" for none). */
  delta: (j: any) => string;
  streamUrl?: string;
}

function build(ai: ResolvedAi, req: AiRequest, stream: boolean): Call {
  const system = [req.system, req.json ? JSON_HINT : ""].filter(Boolean).join("\n\n");
  const maxTokens = req.maxTokens ?? 2000;
  if (ai.kind === "anthropic") {
    return {
      url: `${base(ai.baseUrl)}/v1/messages`,
      headers: { "x-api-key": ai.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: { model: ai.model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: req.messages, ...(stream ? { stream: true } : {}), ...(req.temperature !== undefined ? { temperature: req.temperature } : {}) },
      text: (j) => (j?.content ?? []).filter((c: any) => c?.type === "text").map((c: any) => c.text).join(""),
      delta: (j) => {
        if (j?.type === "error") throw new AiError(j?.error?.message ?? "The AI provider reported an error.");
        return j?.type === "content_block_delta" && j?.delta?.type === "text_delta" ? (j.delta.text ?? "") : "";
      },
    };
  }
  if (ai.kind === "gemini") {
    const model = ai.model.replace(/^models\//, "");
    const body = {
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens, ...(req.temperature !== undefined ? { temperature: req.temperature } : {}), ...(req.json ? { responseMimeType: "application/json" } : {}) },
    };
    const text = (j: any) => {
      if (j?.error) throw new AiError(j.error.message ?? "The AI provider reported an error.");
      return (j?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
    };
    return {
      url: `${base(ai.baseUrl)}/models/${encodeURIComponent(model)}:${stream ? "streamGenerateContent?alt=sse" : "generateContent"}`,
      headers: { "x-goog-api-key": ai.apiKey, "content-type": "application/json" },
      body,
      text,
      delta: text,
    };
  }
  // OpenAI-compatible. api.openai.com wants max_completion_tokens and no temperature on reasoning models.
  const official = isOpenAI(ai.baseUrl);
  return {
    url: `${base(ai.baseUrl)}/chat/completions`,
    headers: { "content-type": "application/json", ...(ai.apiKey ? { authorization: `Bearer ${ai.apiKey}` } : {}), ...(/openrouter\.ai/.test(ai.baseUrl) ? { "x-title": "Cortex" } : {}) },
    body: {
      model: ai.model,
      messages: [...(system ? [{ role: "system", content: system }] : []), ...req.messages],
      ...(official ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens }),
      ...(req.temperature !== undefined && !official ? { temperature: req.temperature } : {}),
      ...(req.json && official ? { response_format: { type: "json_object" } } : {}),
      ...(stream ? { stream: true } : {}),
    },
    text: (j) => {
      if (j?.error) throw new AiError(j.error.message ?? "The AI provider reported an error.");
      const c = j?.choices?.[0]?.message?.content;
      return typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : "";
    },
    delta: (j) => {
      if (j?.error) throw new AiError(j.error.message ?? "The AI provider reported an error.");
      return j?.choices?.[0]?.delta?.content ?? "";
    },
  };
}

/** Drops reasoning blocks some local models (DeepSeek R1, Qwen) put before the answer. */
export const stripThinking = (s: string) => s.replace(/<think>[\s\S]*?<\/think>\s*/g, "");

export async function complete(t: Transport, ai: ResolvedAi, req: AiRequest, signal?: AbortSignal): Promise<string> {
  const call = build(ai, req, false);
  let res: OutboundResponse;
  try {
    res = await t.request(call.url, call.headers, { method: "POST", body: JSON.stringify(call.body), timeoutMs: TIMEOUT, signal });
  } catch (e) {
    throw netError(e, call.url);
  }
  if (res.status >= 400) throw httpError(res.status, res.text());
  let j: unknown;
  try {
    j = res.json();
  } catch {
    throw new AiError("The AI provider sent a reply Cortex couldn't read.");
  }
  return stripThinking(call.text(j));
}

export async function* stream(t: Transport, ai: ResolvedAi, req: AiRequest, signal?: AbortSignal): AsyncIterable<string> {
  const call = build(ai, req, true);
  let res: OutboundStream;
  try {
    res = await t.stream(call.url, call.headers, { method: "POST", body: JSON.stringify(call.body), timeoutMs: TIMEOUT, signal });
  } catch (e) {
    throw netError(e, call.url);
  }
  const decoder = new TextDecoder();
  if (res.status >= 400) {
    let body = "";
    for await (const c of res.chunks) body += decoder.decode(c, { stream: true });
    throw httpError(res.status, body);
  }
  let buf = "";
  let thinking = false;
  try {
    for await (const chunk of res.chunks) {
      buf += decoder.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        let j: unknown;
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        let d = call.delta(j);
        // Hide <think>…</think> from local reasoning models.
        if (d.includes("<think>")) thinking = true;
        if (thinking) {
          const end = d.indexOf("</think>");
          if (end < 0) continue;
          thinking = false;
          d = d.slice(end + 8).replace(/^\s+/, "");
        }
        if (d) yield d;
      }
    }
  } catch (e) {
    throw netError(e, call.url);
  }
}

/** Model ids the provider offers (for the picker). */
export async function listModels(t: Transport, ai: Omit<ResolvedAi, "model">): Promise<string[]> {
  const url = ai.kind === "anthropic" ? `${base(ai.baseUrl)}/v1/models?limit=100` : `${base(ai.baseUrl)}/models`;
  const headers: Record<string, string> =
    ai.kind === "anthropic" ? { "x-api-key": ai.apiKey, "anthropic-version": "2023-06-01" } : ai.kind === "gemini" ? { "x-goog-api-key": ai.apiKey } : ai.apiKey ? { authorization: `Bearer ${ai.apiKey}` } : {};
  let res: OutboundResponse;
  try {
    res = await t.request(url, headers, { method: "GET", timeoutMs: 15_000 });
  } catch (e) {
    throw netError(e, url);
  }
  if (res.status >= 400) throw httpError(res.status, res.text());
  const j: any = res.json();
  if (ai.kind === "gemini") {
    return (j?.models ?? [])
      .filter((m: any) => (m?.supportedGenerationMethods ?? []).includes("generateContent"))
      .map((m: any) => String(m.name).replace(/^models\//, ""));
  }
  return (j?.data ?? []).map((m: any) => String(m.id)).filter(Boolean).sort();
}
