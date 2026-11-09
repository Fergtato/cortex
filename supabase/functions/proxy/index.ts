// Cortex "API connections" proxy — Supabase Edge Function (Deno).
//
// Request: <SUPABASE_URL>/functions/v1/proxy/<connectionId>/<path>?<query>
// with the signed-in user's access token as `Authorization: Bearer …`.
//
// Looks up the caller's own connection + secret token (service role, filtered
// by the verified user id), injects the connection's auth recipe, and forwards
// the request. Tokens never reach the browser.
//   auth: "none"   — no credentials
//         "bearer" — Authorization: Bearer <token>
//         "header" — <authKey>: <token>   (custom header)
//         "query"  — ?<authKey>=<token>   (e.g. TMDB v3 api_key)

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  // ---- who is calling? ----
  const authHeader = req.headers.get("authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "unauthorized" });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json(401, { error: "unauthorized" });
  const userId = userData.user.id;

  // ---- parse /…/proxy/<id>/<subpath> ----
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const at = segments.indexOf("proxy");
  const connectionId = at >= 0 ? decodeURIComponent(segments[at + 1] ?? "") : "";
  const subPath = at >= 0 ? segments.slice(at + 2).join("/") : "";
  if (!connectionId) return json(400, { error: "missing connection id" });

  const { data: conn } = await admin
    .from("connections")
    .select("id, base_url, auth, auth_key")
    .eq("user_id", userId)
    .eq("id", connectionId)
    .maybeSingle();
  if (!conn) return json(404, { error: "unknown connection" });

  const baseUrl = String(conn.base_url).replace(/\/+$/, "");
  if (baseUrl.startsWith("unix://")) {
    return json(400, {
      error: "unix:// sockets are not supported by the Supabase proxy — expose the service over http(s)",
    });
  }

  const { data: secret } = await admin
    .from("connection_secrets")
    .select("token")
    .eq("user_id", userId)
    .eq("connection_id", connectionId)
    .maybeSingle();
  const token: string = secret?.token ?? "";

  // ---- build the upstream request ----
  const params = new URLSearchParams(url.search);
  if (conn.auth === "query" && conn.auth_key && token) params.set(conn.auth_key, token);
  const query = params.toString();

  const headers: Record<string, string> = { accept: "application/json" };
  if (conn.auth === "bearer" && token) {
    headers.authorization = `Bearer ${token}`;
  } else if (conn.auth === "header" && conn.auth_key && token) {
    headers[String(conn.auth_key).toLowerCase()] = token;
  }

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const text = await req.text();
    if (text) {
      body = text;
      headers["content-type"] = req.headers.get("content-type") ?? "application/json";
    }
  }

  const target = `${baseUrl}/${subPath}${query ? `?${query}` : ""}`;
  try {
    // Containment: the resolved URL must stay under the configured base.
    if (!new URL(target).href.startsWith(new URL(baseUrl).href)) {
      return json(400, { error: "path escapes the connection base" });
    }
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        ...CORS_HEADERS,
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    return json(502, { error: `proxy failed: ${String((err as Error)?.message ?? err)}` });
  }
});
