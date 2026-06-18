export interface Page {
  id: string;
  title: string;
  /** Tiptap HTML content for the page body. */
  content: string;
  /** null for top-level projects, otherwise the parent page id. */
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type PageMap = Record<string, Page>;

/* ----------------------------- databases ----------------------------- */

export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "date"
  | "checkbox"
  | "url"
  | "image";

export const PROPERTY_TYPES: PropertyType[] = [
  "text",
  "number",
  "select",
  "date",
  "checkbox",
  "url",
  "image",
];

export interface PropertyDef {
  id: string;
  name: string;
  type: PropertyType;
  /** Available choices for `select` properties. */
  options?: string[];
}

/** A cell value. Stored loosely; interpretation depends on the property type. */
export type CellValue = string | number | boolean | null;

export interface DatabaseRow {
  id: string;
  /** propertyId -> value */
  cells: Record<string, CellValue>;
  createdAt: number;
}

export type ViewType = "table" | "gallery" | "timeline";

export const VIEW_TYPES: ViewType[] = ["table", "gallery", "timeline"];

export interface DatabaseView {
  id: string;
  name: string;
  type: ViewType;
}

/** Per-embed view config (stored on the page's embed node, not the database). */
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
  // select
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
  /** chosen options for select operators */
  values?: string[];
}

export interface DbSort {
  propId: string;
  dir: "asc" | "desc";
}

export interface Database {
  id: string;
  name: string;
  /** First property is always the "title" property and cannot be deleted. */
  properties: PropertyDef[];
  rows: DatabaseRow[];
  views: DatabaseView[];
  activeViewId: string;
  createdAt: number;
  updatedAt: number;
}

export type DatabaseMap = Record<string, Database>;
