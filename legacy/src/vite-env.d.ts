/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional build-time default for the Supabase project URL. */
  readonly VITE_SUPABASE_URL?: string;
  /** Optional build-time default for the Supabase anon (public) key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Runtime config written by the Docker entrypoint (public/env-config.js). */
  __CORTEX_CONFIG__?: { supabaseUrl?: string; supabaseAnonKey?: string };
}
