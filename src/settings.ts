import { useEffect, useState } from "react";

export type AccentKey =
  | "green"
  | "amber"
  | "cyan"
  | "blue"
  | "magenta"
  | "red"
  | "white";
export type ThemeKey = "midnight" | "slate" | "carbon";
export type FontKey = "menlo" | "monaco" | "courier";

export interface Settings {
  accent: AccentKey;
  theme: ThemeKey;
  font: FontKey;
  glow: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  accent: "green",
  theme: "midnight",
  font: "menlo",
  glow: false,
};

interface AccentDef {
  label: string;
  accent: string;
  dim: string;
  selection: string;
}

export const ACCENTS: Record<AccentKey, AccentDef> = {
  green: { label: "green", accent: "#7fd17f", dim: "#2c4a2c", selection: "#1e3a1e" },
  amber: { label: "amber", accent: "#e0b341", dim: "#4a3a12", selection: "#3a2e0e" },
  cyan: { label: "cyan", accent: "#5fd1cf", dim: "#16494a", selection: "#103a3a" },
  blue: { label: "blue", accent: "#7aa2f7", dim: "#1f3350", selection: "#182842" },
  magenta: { label: "magenta", accent: "#d17fd1", dim: "#4a2c4a", selection: "#3a1e3a" },
  red: { label: "red", accent: "#e07f7f", dim: "#4a2424", selection: "#3a1a1a" },
  white: { label: "white", accent: "#eaeae4", dim: "#33332f", selection: "#2c2c28" },
};

interface ThemeDef {
  label: string;
  bg: string;
  panel: string;
  fg: string;
  dim: string;
  line: string;
  lineBright: string;
}

export const THEMES: Record<ThemeKey, ThemeDef> = {
  midnight: {
    label: "midnight",
    bg: "#0c0c0c",
    panel: "#111111",
    fg: "#d6d6cc",
    dim: "#6f6f66",
    line: "#3a3a36",
    lineBright: "#5a5a52",
  },
  slate: {
    label: "slate",
    bg: "#0e1116",
    panel: "#141821",
    fg: "#c9d1d9",
    dim: "#6b7686",
    line: "#2b313b",
    lineBright: "#414b59",
  },
  carbon: {
    label: "carbon",
    bg: "#121110",
    panel: "#1a1817",
    fg: "#d8d2c8",
    dim: "#74706a",
    line: "#36322e",
    lineBright: "#544f49",
  },
};

export const FONTS: Record<FontKey, { label: string; stack: string }> = {
  menlo: {
    label: "Menlo",
    stack: '"SF Mono","SFMono-Regular","Menlo","Consolas",monospace',
  },
  monaco: { label: "Monaco", stack: '"Monaco","Menlo",monospace' },
  courier: { label: "Courier", stack: '"Courier New","Courier",monospace' },
};

const KEY = "project-tracker:settings:v1";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_SETTINGS;
}

export interface SettingsApi {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  // Persist and apply to the document whenever settings change.
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(settings));

    const root = document.documentElement;
    const a = ACCENTS[settings.accent];
    root.style.setProperty("--accent", a.accent);
    root.style.setProperty("--accent-dim", a.dim);
    root.style.setProperty("--selection", a.selection);

    const t = THEMES[settings.theme];
    root.style.setProperty("--bg", t.bg);
    root.style.setProperty("--panel", t.panel);
    root.style.setProperty("--fg", t.fg);
    root.style.setProperty("--dim", t.dim);
    root.style.setProperty("--line", t.line);
    root.style.setProperty("--line-bright", t.lineBright);

    root.style.setProperty("--mono", FONTS[settings.font].stack);
    root.setAttribute("data-glow", settings.glow ? "on" : "off");
  }, [settings]);

  const update = (patch: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...patch }));
  const reset = () => setSettings(DEFAULT_SETTINGS);

  return { settings, update, reset };
}
