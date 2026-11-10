import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

/*
 * API connections (Settings → Connections) and the server proxy. A connection
 * is a named external API with a base URL and an auth recipe; its token stays
 * on the server. Widgets call `proxyFetch(connectionId, path)`.
 */

export type ConnectionAuth = "none" | "bearer" | "header" | "query";

/** A connection as the browser sees it: the token is never sent down. */
export interface ApiConnection {
  id: string;
  name: string;
  baseUrl: string;
  auth: ConnectionAuth;
  authKey: string;
  hasToken: boolean;
}

/** `token`: absent = keep the stored one, "" = clear it. */
export interface ConnectionInput {
  id: string;
  name: string;
  baseUrl: string;
  auth: ConnectionAuth;
  authKey: string;
  token?: string;
}

const KEY = ["connections"];

export const listConnections = () => api<ApiConnection[]>("/connections");
export const saveConnection = (c: ConnectionInput) =>
  api<void>(`/connections/${encodeURIComponent(c.id)}`, { method: "PUT", json: c });
export const deleteConnection = (id: string) => api<void>(`/connections/${encodeURIComponent(id)}`, { method: "DELETE" });

/** The connections list, cached for every widget on a dashboard. */
export function useConnections() {
  const q = useQuery({ queryKey: KEY, queryFn: listConnections, staleTime: 60_000 });
  const qc = useQueryClient();
  return {
    connections: q.data ?? [],
    loading: q.isPending,
    error: q.error ? String(q.error) : null,
    refresh: () => qc.invalidateQueries({ queryKey: KEY }),
  };
}

/** Calls an external API through the server proxy. `path` is relative to the connection's base URL. */
export function proxyFetch(connectionId: string, path: string, init?: { method?: string; body?: unknown }): Promise<Response> {
  const clean = path.replace(/^\/+/, "");
  const hasBody = init?.body !== undefined;
  return fetch(`/api/proxy/${encodeURIComponent(connectionId)}/${clean}`, {
    method: init?.method ?? "GET",
    credentials: "same-origin",
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(init!.body) : undefined,
  });
}

/** Reads a value from JSON with a dot path: "a.b[0].c" or "items.0.name". Empty path = the whole value. */
export function getPath(value: unknown, pathExpr: string): unknown {
  const trimmed = pathExpr.trim();
  if (!trimmed) return value;
  let cur: unknown = value;
  for (const part of trimmed.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean)) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export interface PollState {
  /** Parsed JSON, or the raw text when the response isn't JSON. */
  data: unknown;
  error: string | null;
  loading: boolean;
}

/** Polls `path` on a connection every `refreshSec` seconds (min 5). Idle while inputs are empty. */
export function useApiPoll(connectionId: string, path: string, refreshSec: number): PollState {
  const [state, setState] = useState<PollState>({ data: null, error: null, loading: false });
  const seq = useRef(0);

  useEffect(() => {
    if (!connectionId || !path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let disposed = false;
    async function tick() {
      const mine = ++seq.current;
      try {
        const res = await proxyFetch(connectionId, path);
        const text = await res.text();
        if (disposed || mine !== seq.current) return;
        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            msg = JSON.parse(text).error ?? msg;
          } catch {
            /* not JSON */
          }
          setState({ data: null, error: msg, loading: false });
          return;
        }
        let data: unknown = text;
        try {
          data = JSON.parse(text);
        } catch {
          /* keep raw text */
        }
        setState({ data, error: null, loading: false });
      } catch (err) {
        if (!disposed && mine === seq.current) setState({ data: null, error: String((err as Error)?.message ?? err), loading: false });
      }
    }
    setState((s) => ({ ...s, loading: true }));
    void tick();
    const id = window.setInterval(tick, Math.max(5, refreshSec || 60) * 1000);
    return () => {
      disposed = true;
      window.clearInterval(id);
    };
  }, [connectionId, path, refreshSec]);

  return state;
}

/** Config-form row: pick one of the configured connections. */
export function ConnectionSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { connections, error, loading } = useConnections();
  if (error) return <span className="dw-config-hint">Couldn't load connections.</span>;
  if (!loading && connections.length === 0) {
    return <span className="dw-config-hint">No connections yet. Add one in Settings, Connections.</span>;
  }
  return (
    <select className="dw-config-select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose connection</option>
      {connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
