import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx";
import { resolveTheme, type ThemePrefs } from "./engine";
import type { Theme } from "./schema";

export interface ThemeScopeProps {
  theme: Theme;
  prefs?: Partial<ThemePrefs>;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

/** Applies a theme to a subtree only, e.g. a preview card in Settings. */
export function ThemeScope({ theme, prefs, style, className, children }: ThemeScopeProps) {
  const r = resolveTheme(theme, { themeId: "", ...prefs });
  return (
    <div
      className={cx("cx-theme", className)}
      style={{ ...(r.vars as CSSProperties), colorScheme: r.mode, ...style }}
      {...r.attrs}
    >
      {children}
    </div>
  );
}
