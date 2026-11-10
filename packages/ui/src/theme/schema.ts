import { z } from "zod";

/** Colour tokens a palette defines. `focus` and `data-2` always follow the accent. */
export const COLOR_TOKENS = [
  "bg-000", "bg-100", "bg-200", "bg-300", "bg-400",
  "line-100", "line-200", "line-300",
  "ink-100", "ink-200", "ink-300",
  "accent", "accent-soft", "on-accent",
  "positive", "positive-soft", "negative", "negative-soft", "info", "info-soft",
  "data-1", "data-3", "data-4",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const SHAPES = ["square", "machined", "soft"] as const;
export const FONTS = ["geist", "plex", "system"] as const;
export const ICON_STYLES = ["square", "rounded", "bold"] as const;
export const DENSITIES = ["compact", "default", "comfy"] as const;

// Values end up inside CSS custom properties, so they are whitelisted tightly:
// no `;`, `{`, `}` or `url(` can get through.
const color = z
  .string()
  .trim()
  .regex(/^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([0-9.,%\s/+-]*\))$/i, "Expected a hex, rgb(), hsl() or oklch() colour");
const length = z.string().trim().regex(/^\d+(\.\d+)?(px|rem|em)$/, "Expected a length like 4px");
const fontFamily = z.string().trim().max(200).regex(/^[\w\s",'.-]+$/, "Unsupported characters in font family");

export const themeSchema = z.object({
  format: z.literal(1).default(1),
  name: z.string().trim().min(1).max(60),
  /** Light or dark: sets `color-scheme` and the palette a partial theme fills gaps from. */
  mode: z.enum(["dark", "light"]).default("dark"),
  colors: z.partialRecord(z.enum(COLOR_TOKENS), color).default({}),
  shape: z
    .union([z.enum(SHAPES), z.object({ "radius-xs": length, "radius-sm": length })])
    .optional(),
  fonts: z
    .union([z.enum(FONTS), z.object({ sans: fontFamily, mono: fontFamily, display: fontFamily }).partial()])
    .optional(),
  icons: z.enum(ICON_STYLES).optional(),
  density: z.enum(DENSITIES).optional(),
});

/** A theme file as written by a person (partial colours allowed). */
export type ThemeFile = z.input<typeof themeSchema>;
export type Theme = z.output<typeof themeSchema>;

/** Parses and validates theme JSON text; returns readable errors instead of throwing. */
export function parseTheme(text: string): { ok: true; theme: Theme } | { ok: false; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  const r = themeSchema.safeParse(raw);
  if (r.success) return { ok: true, theme: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join(".") || "theme"}: ${i.message}`),
  };
}
