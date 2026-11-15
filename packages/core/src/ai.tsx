import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { useRouter } from "./router";
import type { AiStatus } from "./shared";

/*
 * AI on the client: whether the person has an AI connected, and a reader for
 * module routes that stream text back. Providers are only ever called by the
 * server (Settings → AI holds the connections).
 */

export function useAiStatus() {
  return useQuery({ queryKey: ["ai", "status"], queryFn: () => api<AiStatus>("/ai/status"), staleTime: 60_000 });
}

/**
 * POSTs JSON to a module route that streams plain text, calling `onDelta`
 * with each piece. Resolves with the whole text. Abort with `signal`.
 */
export async function streamText(path: string, body: unknown, onDelta: (text: string, all: string) => void, signal?: AbortSignal): Promise<string> {
  const res = await fetch(`/api${path}`, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) {
    let message = res.statusText;
    try {
      const j = await res.json();
      message = j.error ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let all = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const piece = decoder.decode(value, { stream: true });
    // The server appends "\u0000ERROR:<message>" if the provider fails mid-stream.
    const err = piece.indexOf("\u0000ERROR:");
    if (err >= 0) {
      const before = piece.slice(0, err);
      if (before) {
        all += before;
        onDelta(before, all);
      }
      throw new ApiError(502, piece.slice(err + 7).trim() || "The AI stopped unexpectedly.");
    }
    all += piece;
    onDelta(piece, all);
  }
  return all;
}

/** Short line pointing to Settings → AI, shown where an AI action would be. */
export function AiUnavailable({ className }: { className?: string }) {
  const { navigate } = useRouter();
  return (
    <p className={`cx-ai-missing ${className ?? ""}`}>
      Connect an AI first.{" "}
      <a
        href="/settings/ai"
        onClick={(e) => {
          e.preventDefault();
          navigate("/settings/ai");
        }}
      >
        Settings → AI
      </a>
    </p>
  );
}
