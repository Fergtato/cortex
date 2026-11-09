import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getDataSource } from "../storage/datasource";

/** Private bucket holding every user's uploaded files under `<uid>/…`. */
export const FILES_BUCKET = "cortex-files";

let client: SupabaseClient | null = null;

/**
 * The Supabase client for the configured data source (one per page load —
 * switching data source reloads the app). Throws outside Supabase mode.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const config = getDataSource();
  if (config.mode !== "supabase") throw new Error("Supabase is not the active data source");
  client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

/** The signed-in user's id (throws when signed out). */
export async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("not signed in");
  return id;
}
