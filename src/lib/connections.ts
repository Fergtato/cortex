import { getDataSource } from "../storage/datasource";

/**
 * Client for the server-side "connections" registry and its request proxy.
 * A connection is a named external API (Homey, Docker, TMDB, …) whose base
 * URL + auth recipe live on the Cortex API server; the browser only ever
 * calls the proxy, so tokens never reach the client. Requires the "api"
 * data source — localStorage mode has no server to keep secrets on.
 */

export type ConnectionAuth = "none" | "bearer" | "header" | "query";

/** A connection as the client sees it — the token is never sent down. */
export interface ApiConnection {
  id: string;
  name: string;
  baseUrl: string;
  auth: ConnectionAuth;
  authKey: string;
  hasToken: boolean;
}

/** Fields accepted when creating/updating (token optional = keep existing). */
export interface ConnectionInput {
  id: string;
  name: string;
  baseUrl: string;
  auth: ConnectionAuth;
  authKey: string;
  token?: string;
}

function apiBase(): string | null {
  const config = getDataSource();
  if (config.mode !== "api") return null;
  return config.apiUrl.replace(/\/$/, "");
}

function authHeaders(json = false): HeadersInit {
  const config = getDataSource();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : {}),
  };
}

/** Whether connections can work at all (needs the API data source). */
export function connectionsAvailable(): boolean {
  return apiBase() !== null;
}

export async function listConnections(): Promise<ApiConnection[]> {
  const base = apiBase();
  if (!base) return [];
  const res = await fetch(`${base}/api/connections`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`connections list failed: ${res.status}`);
  return (await res.json()) as ApiConnection[];
}

export async function saveConnection(input: ConnectionInput): Promise<void> {
  const base = apiBase();
  if (!base) throw new Error("connections need the API data source");
  const res = await fetch(`${base}/api/connections/${input.id}`, {
    method: "PUT",
    headers: authHeaders(true),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`connection save failed: ${res.status}`);
}

export async function deleteConnection(id: string): Promise<void> {
  const base = apiBase();
  if (!base) return;
  const res = await fetch(`${base}/api/connections/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`connection delete failed: ${res.status}`);
}

/**
 * Call an external API through the server proxy. `path` is relative to the
 * connection's base URL (no leading slash needed); credentials are injected
 * server-side.
 */
export async function proxyFetch(
  connectionId: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<Response> {
  const base = apiBase();
  if (!base) throw new Error("connections need the API data source");
  const clean = path.replace(/^\/+/, "");
  return fetch(`${base}/api/proxy/${connectionId}/${clean}`, {
    method: init?.method ?? "GET",
    headers: authHeaders(init?.body !== undefined),
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

/**
 * Pull a value out of a JSON response with a dot path: "a.b[0].c" (bare
 * numbers also index arrays: "items.0.name"). Empty path = whole value.
 */
export function getPath(value: unknown, pathExpr: string): unknown {
  const trimmed = pathExpr.trim();
  if (!trimmed) return value;
  const parts = trimmed
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let cur: unknown = value;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}
