import { getDataSource, isSupabaseMode } from "../storage/datasource";
import { getSupabase } from "./supabase";

/**
 * Client for the "connections" registry (Supabase tables) and its request
 * proxy (the `proxy` Edge Function). A connection is a named external API
 * (Homey, TMDB, …) — base URL + auth recipe. The secret token is written via
 * the `set_connection_token` RPC into a table no client can read; only the
 * Edge Function reads it, so tokens never reach the browser. Requires the
 * Supabase data source — localStorage mode has no server to keep secrets on.
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

interface ConnectionRow {
  id: string;
  name: string;
  base_url: string;
  auth: ConnectionAuth;
  auth_key: string;
  has_token: boolean;
}

/** Whether connections can work at all (needs the Supabase data source). */
export function connectionsAvailable(): boolean {
  return isSupabaseMode();
}

export async function listConnections(): Promise<ApiConnection[]> {
  if (!connectionsAvailable()) return [];
  const { data, error } = await getSupabase()
    .from("connections")
    .select("id, name, base_url, auth, auth_key, has_token")
    .order("name");
  if (error) throw new Error(`connections list failed: ${error.message}`);
  return ((data ?? []) as ConnectionRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    auth: r.auth,
    authKey: r.auth_key,
    hasToken: r.has_token,
  }));
}

export async function saveConnection(input: ConnectionInput): Promise<void> {
  if (!connectionsAvailable()) throw new Error("connections need the Supabase data source");
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  if (!name || !baseUrl) throw new Error("name and baseUrl are required");
  const sb = getSupabase();
  const { error } = await sb.from("connections").upsert(
    {
      id: input.id,
      name,
      base_url: baseUrl,
      auth: input.auth,
      auth_key: input.authKey.trim(),
    },
    { onConflict: "user_id,id" }
  );
  if (error) throw new Error(`connection save failed: ${error.message}`);
  // Absent token = keep the stored one; empty string = clear it.
  if (input.token !== undefined) {
    const { error: tokenErr } = await sb.rpc("set_connection_token", {
      conn_id: input.id,
      new_token: input.token,
    });
    if (tokenErr) throw new Error(`connection token save failed: ${tokenErr.message}`);
  }
}

export async function deleteConnection(id: string): Promise<void> {
  if (!connectionsAvailable()) return;
  const { error } = await getSupabase().from("connections").delete().eq("id", id);
  if (error) throw new Error(`connection delete failed: ${error.message}`);
}

/**
 * Call an external API through the `proxy` Edge Function. `path` is relative
 * to the connection's base URL (no leading slash needed); credentials are
 * injected server-side.
 */
export async function proxyFetch(
  connectionId: string,
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<Response> {
  if (!connectionsAvailable()) throw new Error("connections need the Supabase data source");
  const { supabaseUrl, anonKey } = getDataSource();
  const { data } = await getSupabase().auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) throw new Error("not signed in");
  const clean = path.replace(/^\/+/, "");
  const hasBody = init?.body !== undefined;
  return fetch(`${supabaseUrl}/functions/v1/proxy/${encodeURIComponent(connectionId)}/${clean}`, {
    method: init?.method ?? "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(init!.body) : undefined,
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
