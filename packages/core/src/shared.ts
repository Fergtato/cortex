/*
 * Types shared by the web app and the server. Keep this file free of React
 * and DOM imports: the server imports it through `@cortex/core/server`.
 */

/** Per-user preferences, stored as one JSON blob in `user_settings`. */
export interface UserSettings {
  /** Selected theme + overrides (see `ThemePrefs` in @cortex/ui). */
  theme: {
    themeId: string;
    accent?: string;
    shape?: "square" | "machined" | "soft";
    font?: "geist" | "plex" | "system";
    icons?: "square" | "rounded" | "bold";
    density?: "compact" | "default" | "comfy";
  };
  /** Uploaded theme files, keyed `custom-<id>`. Validated on the client with `parseTheme`. */
  customThemes: Record<string, unknown>;
  /** Module ids the person has switched off. */
  disabledModules: string[];
  /** Per-module preferences, keyed by module id (e.g. `finance.baseCurrency`). */
  modules?: Record<string, Record<string, unknown>>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: { themeId: "dark" },
  customThemes: {},
  disabledModules: [],
  modules: {},
};

/** What `/api/session/info` reports about the instance before and after sign-in. */
export interface InstanceInfo {
  /** No users yet: the first sign-up creates the admin account. */
  needsSetup: boolean;
  /** Public sign-up is open (hosted mode). */
  allowSignup: boolean;
  version: string;
}

/** Random id that works outside secure contexts (plain-http LAN installs have no crypto.randomUUID). */
export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
