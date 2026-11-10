import dark from "../../themes/dark.json";
import light from "../../themes/light.json";
import graphite from "../../themes/graphite.json";
import paper from "../../themes/paper.json";
import {
  COLOR_TOKENS,
  themeSchema,
  type ColorToken,
  type DENSITIES,
  type FONTS,
  type ICON_STYLES,
  type SHAPES,
  type Theme,
} from "./schema";

/** Built-in themes, keyed by id. Ids are stable: they are saved in user settings. */
export const BUILTIN_THEMES: Record<string, Theme> = {
  dark: themeSchema.parse(dark),
  light: themeSchema.parse(light),
  graphite: themeSchema.parse(graphite),
  paper: themeSchema.parse(paper),
};

/** Accent presets from the design system (tuned for dark palettes). */
export const ACCENT_PRESETS: Record<string, string> = {
  teal: "#2fd9b4",
  amber: "#f2a93b",
  blue: "#7aa2ff",
  violet: "#b69cff",
  rose: "#ff8fa3",
  lime: "#b8e05a",
};

/**
 * What a person picks in Settings. Everything but the theme is an optional
 * override: unset means "use what the theme says, else the system default".
 */
export interface ThemePrefs {
  themeId: string;
  accent?: string;
  shape?: (typeof SHAPES)[number];
  font?: (typeof FONTS)[number];
  icons?: (typeof ICON_STYLES)[number];
  density?: (typeof DENSITIES)[number];
}

export const DEFAULT_PREFS: ThemePrefs = { themeId: "dark" };

export interface ResolvedTheme {
  vars: Record<string, string>;
  attrs: { "data-shape"?: string; "data-font"?: string; "data-icons": string; "data-density": string };
  mode: "dark" | "light";
}

export function parseHex(c: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return null;
  const x = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const c = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** WCAG contrast ratio of two hex colours, or null if either is not plain hex. */
export function contrast(a: string, b: string): number | null {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return null;
  const [l1, l2] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Variables a custom accent needs: the accent, its soft ground, readable ink on it, and its aliases. */
export function accentVars(accent: string, onAccent?: string): Record<string, string> {
  const rgb = parseHex(accent);
  const vars: Record<string, string> = { "--accent": accent, "--focus": accent, "--data-2": accent };
  if (!rgb) return vars;
  const L = luminance(rgb);
  vars["--on-accent"] = onAccent ?? (1.05 / (L + 0.05) > (L + 0.05) / 0.0517 ? "#ffffff" : "#050506");
  vars["--accent-soft"] = `rgba(${rgb.join(", ")}, 0.12)`;
  return vars;
}

/** Every colour a theme resolves to: its own values over the built-in palette of its mode. */
export function themeColors(theme: Theme): Record<ColorToken, string> {
  const base = BUILTIN_THEMES[theme.mode === "light" ? "light" : "dark"].colors;
  const out = {} as Record<ColorToken, string>;
  for (const t of COLOR_TOKENS) out[t] = theme.colors[t] ?? base[t] ?? "";
  return out;
}

export function resolveTheme(theme: Theme, prefs: ThemePrefs): ResolvedTheme {
  const colors = themeColors(theme);
  const vars: Record<string, string> = {};
  for (const t of COLOR_TOKENS) vars[`--${t}`] = colors[t];
  vars["--focus"] = colors.accent;
  vars["--data-2"] = colors.accent;
  if (prefs.accent) Object.assign(vars, accentVars(prefs.accent));

  const attrs: ResolvedTheme["attrs"] = {
    "data-icons": prefs.icons ?? theme.icons ?? "square",
    "data-density": prefs.density ?? theme.density ?? "default",
  };

  const shape = prefs.shape ?? theme.shape ?? "machined";
  if (typeof shape === "string") attrs["data-shape"] = shape;
  else {
    vars["--radius-xs"] = shape["radius-xs"];
    vars["--radius-sm"] = shape["radius-sm"];
  }

  const fonts = prefs.font ?? theme.fonts ?? "geist";
  if (typeof fonts === "string") attrs["data-font"] = fonts;
  else {
    if (fonts.sans) vars["--font-sans"] = fonts.sans;
    if (fonts.mono) vars["--font-mono"] = fonts.mono;
    if (fonts.display) vars["--font-display"] = fonts.display;
  }

  return { vars, attrs, mode: theme.mode };
}

/** Writes a resolved theme onto an element (the `<html>` root by default). */
export function applyTheme(resolved: ResolvedTheme, el: HTMLElement = document.documentElement): void {
  for (const t of COLOR_TOKENS) el.style.removeProperty(`--${t}`);
  for (const v of ["--focus", "--data-2", "--radius-xs", "--radius-sm", "--font-sans", "--font-mono", "--font-display"]) {
    el.style.removeProperty(v);
  }
  for (const [k, v] of Object.entries(resolved.vars)) el.style.setProperty(k, v);
  for (const a of ["data-shape", "data-font", "data-icons", "data-density"] as const) {
    const v = resolved.attrs[a];
    if (v) el.setAttribute(a, v);
    else el.removeAttribute(a);
  }
  el.style.colorScheme = resolved.mode;
}

export interface ContrastIssue {
  fg: string;
  bg: string;
  ratio: number;
  min: number;
}

/**
 * The design system's contrast rules: 4.5:1 for text on bg-000…bg-300,
 * 3:1 for line-300 / accent / focus on bg-100…bg-300.
 */
export function checkContrast(vars: Record<string, string>): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  const check = (fg: string, bgs: string[], min: number) => {
    for (const bg of bgs) {
      const r = contrast(vars[`--${fg}`] ?? "", vars[`--${bg}`] ?? "");
      if (r != null && r < min) issues.push({ fg, bg, ratio: Math.round(r * 100) / 100, min });
    }
  };
  for (const ink of ["ink-100", "ink-200", "ink-300", "positive", "negative", "info"]) {
    check(ink, ["bg-000", "bg-100", "bg-200", "bg-300"], 4.5);
  }
  for (const edge of ["line-300", "accent"]) check(edge, ["bg-100", "bg-200", "bg-300"], 3);
  return issues;
}
