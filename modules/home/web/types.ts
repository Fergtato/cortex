import type { WidgetInstance } from "@cortex/core";
import type { SelectColor } from "@cortex/icons/colors";

/** A widget placed on a dashboard (see the core widget contract). */
export type Widget = WidgetInstance;

export interface Dashboard {
  /** Absent/"dashboard" for a real dashboard; folders share the collection. */
  kind?: "dashboard";
  id: string;
  /** Sidebar label; dashboards render no in-body title. */
  name: string;
  /** Optional icon (see @cortex/icons) shown in the sidebar. */
  icon?: string;
  iconColor?: SelectColor;
  widgets: Widget[];
  /** Grid column and row counts. */
  columns: number;
  rows: number;
  /** Row height in px (scroll mode); fit mode divides the viewport evenly. */
  rowHeight: number;
  /** "fit" fills the viewport with no scrolling; "scroll" grows downward. */
  sizing: "fit" | "scroll";
  /** Containing folder id (null/absent = top level). */
  folderId?: string | null;
  /** Sort position within its container. */
  order?: number;
  createdAt: number;
  updatedAt: number;
}

/** A sidebar folder grouping dashboards (one level; no nesting). */
export interface Folder {
  kind: "folder";
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

export type DashItem = Dashboard | Folder;
export type DashboardMap = Record<string, DashItem>;

export function isFolder(item: DashItem | undefined): item is Folder {
  return item?.kind === "folder";
}

export function isDashboard(item: DashItem | undefined): item is Dashboard {
  return item !== undefined && item.kind !== "folder";
}
