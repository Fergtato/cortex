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
  /** App rail order as module ids. Apps missing from it (newly added) follow in registry order. */
  appOrder?: string[];
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

// ------------------------------------------------------------------ AI

/** How Cortex talks to a provider: three wire formats cover every preset. */
export type AiKind = "anthropic" | "openai" | "gemini";

export interface AiPreset {
  id: string;
  label: string;
  kind: AiKind;
  baseUrl: string;
  needsKey: boolean;
  /** Suggested model; empty means pick from the provider's list. */
  model: string;
  hint: string;
  keyUrl?: string;
}

export const AI_PRESETS: AiPreset[] = [
  { id: "claude", label: "Claude", kind: "anthropic", baseUrl: "https://api.anthropic.com", needsKey: true, model: "claude-sonnet-5-5", hint: "Anthropic API key", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "ChatGPT", kind: "openai", baseUrl: "https://api.openai.com/v1", needsKey: true, model: "", hint: "OpenAI API key", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "gemini", label: "Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", needsKey: true, model: "", hint: "Google AI Studio key", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", needsKey: true, model: "", hint: "One key for hundreds of models", keyUrl: "https://openrouter.ai/keys" },
  { id: "ollama", label: "Ollama", kind: "openai", baseUrl: "http://localhost:11434/v1", needsKey: false, model: "", hint: "Models running on your own machine" },
  { id: "lmstudio", label: "LM Studio", kind: "openai", baseUrl: "http://localhost:1234/v1", needsKey: false, model: "", hint: "LM Studio's local server" },
  { id: "custom", label: "Other (OpenAI-compatible)", kind: "openai", baseUrl: "", needsKey: false, model: "", hint: "Any server that speaks the OpenAI chat API" },
];

/** A saved AI connection as the browser sees it (the key never leaves the server). */
export interface AiConnection {
  id: string;
  name: string;
  preset: string;
  kind: AiKind;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  isDefault: boolean;
  shared: boolean;
  /** Owned by someone else (the admin's shared connection). */
  readOnly: boolean;
}

export interface AiStatus {
  available: boolean;
  connection: { id: string; name: string; model: string; shared: boolean } | null;
}
