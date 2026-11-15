import { cx } from "../cx";

/** 24px grid, 1.5px stroke, square caps: one path per icon. */
const PATHS = {
  home: "M4 10.5 12 4l8 6.5V20h-5v-5.5H9V20H4z",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  pulse: "M3 12h4l2-5 4 10 2-5h6",
  wallet: "M4 7h16v12H4z M4 7l12-3v3 M15 13h2",
  pot: "M5 10h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z M3 10h18 M9 5v2 M12 4v3 M15 5v2",
  film: "M4 5h16v14H4z M8 5v14 M16 5v14 M4 9.5h4 M4 14.5h4 M16 9.5h4 M16 14.5h4",
  note: "M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h5",
  sliders: "M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 5v4 M9 15v4",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M16 16l4 4",
  plus: "M12 5v14 M5 12h14",
  minus: "M5 12h14",
  "chevron-right": "M9 6l6 6-6 6",
  "chevron-left": "M15 6l-6 6 6 6",
  "chevron-down": "M6 9l6 6 6-6",
  "arrow-up": "M12 19V5 M6 11l6-6 6 6",
  "arrow-down": "M12 5v14 M6 13l6 6 6-6",
  "arrow-up-right": "M7 17 17 7 M8 7h9v9",
  check: "M5 12.5 10 17l9-10",
  calendar: "M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 21h4",
  sidebar: "M4 5h16v14H4z M9 5v14",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  clock: "M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z M12 8v4l3 2",
  inbox: "M4 13l2-8h12l2 8v6H4z M4 13h5l1 2h4l1-2h5",
  user: "M12 12a4 4 0 1 0 0-8a4 4 0 1 0 0 8z M4 20c1-4 4-6 8-6s7 2 8 6",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6z",
  list: "M9 6h11 M9 12h11 M9 18h11 M4 6h1 M4 12h1 M4 18h1",
  archive: "M3 4h18v4H3z M5 8v12h14V8 M10 12h4",
  x: "M6 6l12 12 M18 6 6 18",
  wrap: "M4 6h16 M4 12h12.5a3.5 3.5 0 0 1 0 7H12 M14 16.5 11.5 19l2.5 2.5 M4 18h4",
  trash: "M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5",
  grip: "M9 6h.01 M15 6h.01 M9 12h.01 M15 12h.01 M9 18h.01 M15 18h.01",
  heart: "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9h.01",
  pencil: "M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
  shuffle: "M4 7h4l8 10h4 M4 17h4l2-2.5 M14 9.5 16 7h4 M18 5l2 2-2 2 M18 15l2 2-2 2",
  basket: "M3 9h18l-2 11H5z M8 9l3-5 M16 9l-3-5 M9 13v4 M15 13v4",
  timeline: "M4 6h8 M8 12h10 M6 18h7 M4 3v18",
  play: "M7 5v14l11-7z",
  copy: "M8 8h12v12H8z M4 16V4h12",
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1 M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth, label, className }: IconProps) {
  return (
    <svg
      className={cx("cx-icon", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      // Theme icon style (cap, join, stroke) comes from CSS vars; an explicit strokeWidth wins.
      style={strokeWidth ? { strokeWidth } : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    >
      <path d={PATHS[name] ?? PATHS.grid} />
    </svg>
  );
}
