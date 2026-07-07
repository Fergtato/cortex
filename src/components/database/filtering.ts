import type {
  CellValue,
  Database,
  DatabaseRow,
  FilterCondition,
  FilterOp,
  PropertyDef,
  PropertyType,
} from "../../types";

export interface OpDef {
  value: FilterOp;
  label: string;
}

/** The operators offered for a given property type (first = default). */
export function operatorsForType(type: PropertyType): OpDef[] {
  switch (type) {
    case "number":
      return [
        { value: "num_eq", label: "=" },
        { value: "num_neq", label: "≠" },
        { value: "num_gt", label: ">" },
        { value: "num_lt", label: "<" },
        { value: "num_gte", label: "≥" },
        { value: "num_lte", label: "≤" },
        { value: "empty", label: "Is empty" },
        { value: "not_empty", label: "Is not empty" },
      ];
    case "select":
    case "multiselect":
      return [
        { value: "select_is", label: "Is" },
        { value: "select_is_not", label: "Is not" },
        { value: "empty", label: "Is empty" },
        { value: "not_empty", label: "Is not empty" },
      ];
    case "checkbox":
      return [
        { value: "checked", label: "Is checked" },
        { value: "unchecked", label: "Is unchecked" },
      ];
    case "date":
      return [
        { value: "date_on", label: "Is" },
        { value: "date_before", label: "Is before" },
        { value: "date_after", label: "Is after" },
        { value: "empty", label: "Is empty" },
        { value: "not_empty", label: "Is not empty" },
      ];
    case "image":
      return [
        { value: "not_empty", label: "Has image" },
        { value: "empty", label: "No image" },
      ];
    case "url":
    case "text":
    default:
      return [
        { value: "contains", label: "Contains" },
        { value: "not_contains", label: "Does not contain" },
        { value: "is", label: "Is" },
        { value: "is_not", label: "Is not" },
        { value: "starts_with", label: "Starts with" },
        { value: "ends_with", label: "Ends with" },
        { value: "empty", label: "Is empty" },
        { value: "not_empty", label: "Is not empty" },
      ];
  }
}

export function defaultOpFor(type: PropertyType): FilterOp {
  return operatorsForType(type)[0].value;
}

export function opLabel(op: FilterOp, type: PropertyType): string {
  return operatorsForType(type).find((o) => o.value === op)?.label ?? op;
}

export type ValueKind = "none" | "text" | "number" | "date" | "select";

/** What value control a given operator needs. */
export function valueKind(op: FilterOp, type: PropertyType): ValueKind {
  if (op === "empty" || op === "not_empty" || op === "checked" || op === "unchecked") {
    return "none";
  }
  if (type === "select" || type === "multiselect") return "select";
  if (type === "number") return "number";
  if (type === "date") return "date";
  return "text";
}

function matchOne(cell: CellValue, cond: FilterCondition): boolean {
  const s = cell == null ? "" : Array.isArray(cell) ? cell.join(",") : String(cell);
  const v = cond.value ?? "";
  const lower = s.toLowerCase();
  const lv = v.toLowerCase();
  switch (cond.op) {
    case "empty":
      return s.trim() === "" && cell !== true;
    case "not_empty":
      return s.trim() !== "" || cell === true;
    // text — an empty value means "incomplete", so don't filter anything out yet
    case "is":
      return v === "" ? true : lower === lv;
    case "is_not":
      return v === "" ? true : lower !== lv;
    case "contains":
      return v === "" ? true : lower.includes(lv);
    case "not_contains":
      return v === "" ? true : !lower.includes(lv);
    case "starts_with":
      return v === "" ? true : lower.startsWith(lv);
    case "ends_with":
      return v === "" ? true : lower.endsWith(lv);
    // number
    case "num_eq":
      return v === "" ? true : Number(cell) === Number(v);
    case "num_neq":
      return v === "" ? true : Number(cell) !== Number(v);
    case "num_gt":
      return v === "" ? true : Number(cell) > Number(v);
    case "num_lt":
      return v === "" ? true : Number(cell) < Number(v);
    case "num_gte":
      return v === "" ? true : Number(cell) >= Number(v);
    case "num_lte":
      return v === "" ? true : Number(cell) <= Number(v);
    // select / multiselect — cell is an option id (or array of ids)
    case "select_is": {
      if ((cond.values?.length ?? 0) === 0) return true;
      if (Array.isArray(cell)) return cell.some((id) => cond.values!.includes(id));
      return cond.values!.includes(s);
    }
    case "select_is_not": {
      if ((cond.values?.length ?? 0) === 0) return true;
      if (Array.isArray(cell)) return !cell.some((id) => cond.values!.includes(id));
      return !cond.values!.includes(s);
    }
    // checkbox
    case "checked":
      return cell === true;
    case "unchecked":
      return cell !== true;
    // date
    case "date_on":
      return v === "" ? true : s === v;
    case "date_before":
      return v === "" || s === "" ? true : s < v;
    case "date_after":
      return v === "" || s === "" ? true : s > v;
    default:
      return true;
  }
}

/** A row passes when every filter matches (filters combine with AND, in order). */
export function matchesAll(
  db: Database,
  row: DatabaseRow,
  filters: FilterCondition[]
): boolean {
  return filters.every((cond) => {
    const prop = db.properties.find((p) => p.id === cond.propId);
    if (!prop) return true;
    return matchOne(row.cells[cond.propId] ?? null, cond);
  });
}

/** Short value summary shown on a filter chip. */
export function chipSummary(cond: FilterCondition, prop: PropertyDef): string {
  const kind = valueKind(cond.op, prop.type);
  if (kind === "none") return opLabel(cond.op, prop.type).toLowerCase();
  if (kind === "select") {
    // Stored values are option ids — show the option names.
    return (cond.values ?? [])
      .map((id) => prop.options?.find((o) => o.id === id)?.name ?? id)
      .join(", ");
  }
  return cond.value ?? "";
}
