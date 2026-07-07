import type { ComponentType } from "react";
import { icons as lucideIcons, Icon as LucideLabIcon, type LucideProps } from "lucide-react";
import * as lab from "@lucide/lab";
import type { SelectColor } from "../types";

/**
 * The FULL Lucide catalogue (~1745 icons) plus every @lucide/lab extra
 * (~300), keyed by the kebab-case names shown on lucide.dev. Loading all of
 * them intentionally trades bundle size for choice — this is a self-hosted
 * personal app, so the ~1 MB raw cost is acceptable.
 *
 * Lab icons are bare icon-node arrays rendered through lucide's generic
 * <Icon iconNode=…>; core icons are ready-made components.
 */
type LabIconNode = Parameters<typeof LucideLabIcon>[0]["iconNode"];
type IconDef = ComponentType<LucideProps> | LabIconNode;

/** "AArrowDown" / "pacMan" / "Gamepad2" -> "a-arrow-down" / "pac-man" / "gamepad-2" */
function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-zA-Z])(\d)/g, "$1-$2")
    .toLowerCase();
}

const registry: Record<string, IconDef> = {};
// Lab first so the official set wins any name collision.
for (const [name, node] of Object.entries(lab)) {
  registry[kebab(name)] = node as LabIconNode;
}
for (const [name, component] of Object.entries(lucideIcons)) {
  registry[kebab(name)] = component;
}
// Back-compat for keys stored before the picker exposed the full catalogue.
const ALIASES: Record<string, string> = {
  gamepad: "gamepad-2",
  flask: "flask-conical",
  forest: "trees-forest",
};
for (const [from, to] of Object.entries(ALIASES)) {
  if (!registry[from] && registry[to]) registry[from] = registry[to];
}

export const ICON_REGISTRY = registry;
export const ICON_NAMES = Object.keys(ICON_REGISTRY).sort();

/** True when the stored value is a known icon key (legacy emojis aren't). */
export function isIconName(name: string | undefined): name is string {
  return Boolean(name && name in ICON_REGISTRY);
}

interface Props {
  /** Registry key (Page.icon). Unknown keys (e.g. legacy emoji) render nothing. */
  name: string;
  size?: number;
  strokeWidth?: number;
  /** Palette colour; unset inherits the surrounding text colour. */
  color?: SelectColor;
  className?: string;
}

export function Icon({ name, size = 14, strokeWidth = 1.5, color, className }: Props) {
  const def = ICON_REGISTRY[name];
  if (!def) return null;
  const svg = Array.isArray(def) ? (
    <LucideLabIcon iconNode={def} size={size} strokeWidth={strokeWidth} />
  ) : (
    (() => {
      const C = def as ComponentType<LucideProps>;
      return <C size={size} strokeWidth={strokeWidth} />;
    })()
  );
  return (
    <span
      className={`glyph${color ? ` selc-${color}` : ""}${className ? ` ${className}` : ""}`}
      style={color ? { color: "var(--selc)" } : undefined}
    >
      {svg}
    </span>
  );
}
