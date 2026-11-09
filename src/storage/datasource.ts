export type DataSourceMode = "local" | "supabase";

export interface DataSourceConfig {
  mode: DataSourceMode;
  /** Supabase project URL (e.g. https://supabase.example.com), no trailing slash. */
  supabaseUrl: string;
  /** Supabase anon (public) key. Never the service-role key. */
  anonKey: string;
}

const ENV_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const ENV_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

// A build that ships with Supabase credentials (VITE_SUPABASE_URL +
// VITE_SUPABASE_ANON_KEY) defaults to Supabase; otherwise to localStorage.
export const DEFAULT_DATA_SOURCE: DataSourceConfig = {
  mode: ENV_URL && ENV_KEY ? "supabase" : "local",
  supabaseUrl: ENV_URL,
  anonKey: ENV_KEY,
};

// The data-source choice itself always lives in localStorage so the app knows
// where to read everything else from, regardless of the chosen backend.
const KEY = "cortex:datasource:v1";

export function getDataSource(): DataSourceConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DataSourceConfig> & { mode?: string };
      const merged: DataSourceConfig = {
        ...DEFAULT_DATA_SOURCE,
        ...saved,
        supabaseUrl: saved.supabaseUrl || DEFAULT_DATA_SOURCE.supabaseUrl,
        anonKey: saved.anonKey || DEFAULT_DATA_SOURCE.anonKey,
      } as DataSourceConfig;
      // Legacy "api" (SQLite server) mode no longer exists.
      if (merged.mode !== "local" && merged.mode !== "supabase") merged.mode = "local";
      if (merged.mode === "supabase" && (!merged.supabaseUrl || !merged.anonKey)) {
        merged.mode = "local";
      }
      return merged;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_DATA_SOURCE;
}

export function setDataSource(config: DataSourceConfig) {
  localStorage.setItem(
    KEY,
    JSON.stringify({ ...config, supabaseUrl: config.supabaseUrl.replace(/\/+$/, "") })
  );
}

export function isSupabaseMode(): boolean {
  return getDataSource().mode === "supabase";
}
