export interface Page {
  id: string;
  title: string;
  /** Tiptap HTML content for the page body. */
  content: string;
  /** null for top-level projects, otherwise the parent page id. */
  parentId: string | null;
  /** Optional icon name (see ICON_REGISTRY) shown before the title. */
  icon?: string;
  /** Palette colour for the icon; unset renders in the text colour. */
  iconColor?: SelectColor;
  /** Optional cover image (data URL) shown as a banner above the title. */
  cover?: string;
  /** Sort position among siblings (same parentId). Lower shows first. */
  order?: number;
  createdAt: number;
  updatedAt: number;
}

export type PageMap = Record<string, Page>;

/* ----------------------------- databases ----------------------------- */

export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "multiselect"
  | "date"
  | "checkbox"
  | "url"
  | "image"
  | "formula"
  | "created_time"
  | "last_edited_time"
  | "auto_id";

/** The types offered in the property-type dropdown. */
export const PROPERTY_TYPES: PropertyType[] = [
  "text",
  "number",
  "select",
  "multiselect",
  "date",
  "checkbox",
  "url",
  "image",
  "formula",
  "created_time",
  "last_edited_time",
  "auto_id",
];

/** Named colours for select options; each maps to CSS vars in styles.css. */
export const SELECT_COLORS = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
] as const;

export type SelectColor = (typeof SELECT_COLORS)[number];

export interface SelectOption {
  id: string;
  name: string;
  color: SelectColor;
}

export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  /** Available choices for `select` / `multiselect` properties. */
  options?: SelectOption[];
  /** Text wrap: the cell auto-grows to show all content instead of clipping. */
  wrap?: boolean;
  /** Optional fixed column width in px (table view). */
  width?: number;
  /** Expression source for `formula` properties. */
  formula?: string;
}

/**
 * A cell value. Stored loosely; interpretation depends on the property type.
 * `select` stores an option id; `multiselect` stores an array of option ids.
 */
export type CellValue = string | number | boolean | string[] | null;

export interface DatabaseRow {
  id: string;
  /** propertyId -> value */
  cells: Record<string, CellValue>;
  createdAt: number;
  /** Bumped on every cell edit (feeds the last-edited-time property). */
  updatedAt?: number;
  /** Sequential number assigned at creation (feeds the auto-id property). */
  seq?: number;
}

export type ViewType = "table" | "gallery" | "timeline" | "kanban" | "calendar";

/** The types offered in the "+ view" dropdown. */
export const VIEW_TYPES: ViewType[] = ["table", "gallery", "timeline", "kanban", "calendar"];

/** Footer aggregation for a column (table group-by / totals). */
export type AggOp = "count" | "sum" | "avg" | "min" | "max" | "filled" | "empty";

export interface DatabaseView {
  id: string;
  name: string;
  type: ViewType;
  /** View-owned filters/sort — shared everywhere this view is shown. */
  filters?: FilterCondition[];
  sort?: DbSort | null;
  /** Grouping property (kanban columns / table groups). */
  groupByPropId?: string | null;
  /** Gallery cover behaviour: crop to fill (default) or letterbox to fit. */
  coverFit?: "fit" | "fill";
  /** Date property a calendar view is laid out on. */
  datePropId?: string | null;
  /** propertyId -> aggregation shown in the table footer. */
  aggregations?: Record<string, AggOp>;
}

export type FilterOp =
  // text / url
  | "is"
  | "is_not"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  // any type
  | "empty"
  | "not_empty"
  // number
  | "num_eq"
  | "num_neq"
  | "num_gt"
  | "num_lt"
  | "num_gte"
  | "num_lte"
  // select / multiselect
  | "select_is"
  | "select_is_not"
  // checkbox
  | "checked"
  | "unchecked"
  // date
  | "date_on"
  | "date_before"
  | "date_after";

export interface FilterCondition {
  id: string;
  propId: string;
  op: FilterOp;
  /** single value for text/number/date operators */
  value?: string;
  /** chosen option ids for select/multiselect operators */
  values?: string[];
}

export interface DbSort {
  propId: string;
  dir: "asc" | "desc";
}

export interface Database {
  /** Absent/"database" for a real database; folders share the collection. */
  kind?: "database";
  id: string;
  name: string;
  /** First property is always the "title" property and cannot be deleted. */
  properties: PropertyDef[];
  rows: DatabaseRow[];
  views: DatabaseView[];
  activeViewId: string;
  /** Next sequential row number (auto-id property). */
  nextSeq?: number;
  /** Containing folder id (null/absent = top level). */
  folderId?: string | null;
  /** Sort position within its container (top level or a folder). */
  order?: number;
  createdAt: number;
  updatedAt: number;
}

/* ----------------------------- dashboards ---------------------------- */

/** Widget kinds available in the dashboard widget picker. Grows per stage. */
export type WidgetType =
  | "text"
  | "clock"
  | "timer"
  | "image"
  | "list"
  | "scifi"
  | "db-view"
  | "db-list"
  | "metric"
  | "habit";

export interface Widget {
  id: string;
  type: WidgetType;
  /** Top-left grid cell (0-based column/row). */
  x: number;
  y: number;
  /** Span in grid columns/rows (min 1×1). */
  w: number;
  h: number;
  /** Per-type settings; each widget component owns its own shape. */
  config: Record<string, unknown>;
}

export interface Dashboard {
  /** Absent/"dashboard" for a real dashboard; folders share the collection. */
  kind?: "dashboard";
  id: string;
  /** Sidebar label only — dashboards render no in-body title. */
  name: string;
  /** Optional icon (see ICON_REGISTRY) shown in the sidebar. */
  icon?: string;
  iconColor?: SelectColor;
  widgets: Widget[];
  /** Grid column count. */
  columns: number;
  /** Grid row count. */
  rows: number;
  /** Row height in px (scroll mode); fit mode divides the viewport evenly. */
  rowHeight: number;
  /** "fit" fills the viewport with no scrolling; "scroll" grows downward. */
  sizing: "fit" | "scroll";
  /** Containing folder id (null/absent = top level). */
  folderId?: string | null;
  /** Sort position within its container (top level or a folder). */
  order?: number;
  createdAt: number;
  updatedAt: number;
}

/** The dashboards collection holds both dashboards and folders, keyed by id. */
export type DashItem = Dashboard | Folder;

export type DashboardMap = Record<string, DashItem>;

export function isDashboard(item: DashItem | undefined): item is Dashboard {
  return item !== undefined && item.kind !== "folder";
}

/* ------------------------------ folders ------------------------------ */

/** A sidebar folder grouping databases or dashboards (one level; no nesting). */
export interface Folder {
  kind: "folder";
  id: string;
  name: string;
  /** Sort position in the interleaved top-level list. */
  order: number;
  createdAt: number;
}

/** The databases collection holds both databases and folders, keyed by id. */
export type DbItem = Database | Folder;

export type DatabaseMap = Record<string, DbItem>;

export function isFolder(item: DbItem | DashItem | undefined): item is Folder {
  return item?.kind === "folder";
}

export function isDatabase(item: DbItem | undefined): item is Database {
  return item !== undefined && item.kind !== "folder";
}
