import { useEffect, useMemo } from "react";
import { useSettings, type UserSettings } from "@cortex/core";
import { applyTheme, BUILTIN_THEMES, resolveTheme, themeSchema, type Theme } from "@cortex/ui";

/** Every theme the person can pick: built-ins, then their uploaded ones (invalid ones skipped). */
export function availableThemes(settings: UserSettings): Record<string, Theme> {
  const out: Record<string, Theme> = { ...BUILTIN_THEMES };
  for (const [id, raw] of Object.entries(settings.customThemes)) {
    const r = themeSchema.safeParse(raw);
    if (r.success) out[id] = r.data;
  }
  return out;
}

/** Applies the signed-in person's theme to <html> and caches it for the pre-paint script in index.html. */
export function ThemeApplier() {
  const { settings, loaded } = useSettings();
  const resolved = useMemo(() => {
    const themes = availableThemes(settings);
    const theme = themes[settings.theme.themeId] ?? BUILTIN_THEMES.dark;
    return resolveTheme(theme, settings.theme);
  }, [settings]);

  useEffect(() => {
    if (!loaded) return;
    applyTheme(resolved);
    try {
      localStorage.setItem("cortex.theme", JSON.stringify(resolved));
    } catch {
      /* storage unavailable: only the pre-paint cache is lost */
    }
  }, [resolved, loaded]);

  return null;
}
