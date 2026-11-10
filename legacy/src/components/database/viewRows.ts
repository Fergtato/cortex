import type { Database, DatabaseRow, DatabaseView, PropertyDef } from "../../types";
import { matchesAll } from "./filtering";
import { computedCellValue } from "../../lib/formula";

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Sort key for a cell; select values sort by option *name*, not id. */
function sortKey(v: unknown, prop?: PropertyDef): unknown {
  if (!prop) return v;
  if (prop.type === "select" && typeof v === "string") {
    return prop.options?.find((o) => o.id === v)?.name ?? v;
  }
  if (prop.type === "multiselect" && Array.isArray(v)) {
    return v
      .map((id) => prop.options?.find((o) => o.id === id)?.name ?? id)
      .join(", ");
  }
  return v;
}

export function compareCells(a: unknown, b: unknown, prop?: PropertyDef): number {
  const ae = isEmpty(a);
  const be = isEmpty(b);
  if (ae && be) return 0;
  if (ae) return 1; // empties sort last
  if (be) return -1;
  const type = prop?.type;
  if (
    type === "number" ||
    type === "auto_id" ||
    type === "created_time" ||
    type === "last_edited_time"
  ) {
    return Number(a) - Number(b);
  }
  if (type === "date") return new Date(String(a)).getTime() - new Date(String(b)).getTime();
  if (type === "checkbox") return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  // Formulas: numeric when both sides are numeric, string otherwise.
  if (type === "formula" && typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  const ka = sortKey(a, prop);
  const kb = sortKey(b, prop);
  return String(ka).localeCompare(String(kb));
}

/**
 * A database's rows through a view's lens: view-owned filters applied, then
 * the view's sort. Shared by DatabaseBlock and the dashboard's DB-connected
 * widgets so "what this view shows" is computed exactly one way.
 */
export function viewRows(db: Database, view: DatabaseView | undefined): DatabaseRow[] {
  const filters = view?.filters ?? [];
  const sort = view?.sort ?? null;
  let out = filters.length ? db.rows.filter((r) => matchesAll(db, r, filters)) : db.rows;
  if (sort && sort.propId) {
    const prop = db.properties.find((p) => p.id === sort.propId);
    out = [...out].sort((a, b) => {
      const av = prop ? computedCellValue(db, a, prop) : a.cells[sort.propId];
      const bv = prop ? computedCellValue(db, b, prop) : b.cells[sort.propId];
      const c = compareCells(av, bv, prop);
      return sort.dir === "asc" ? c : -c;
    });
  }
  return out;
}
