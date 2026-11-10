import type { Database, DatabaseRow, PropertyDef } from "../types";
import { computedCellValue, formatComputed, isComputedType } from "./formula";

/** Export value for a cell — computed columns yield their computed value. */
function exportValue(db: Database, row: DatabaseRow, prop: PropertyDef): unknown {
  if (isComputedType(prop.type)) {
    return formatComputed(prop, computedCellValue(db, row, prop));
  }
  return row.cells[prop.id];
}

/** Render a cell for export; select values resolve option ids to names. */
function cellToText(value: unknown, prop?: PropertyDef): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return value.map((v) => optionName(String(v), prop)).join(", ");
  }
  if (typeof value === "string" && (prop?.type === "select" || prop?.type === "multiselect")) {
    return optionName(value, prop);
  }
  return String(value);
}

function optionName(id: string, prop?: PropertyDef): string {
  return prop?.options?.find((o) => o.id === id)?.name ?? id;
}

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportToJSON(db: Database): string {
  const data = {
    name: db.name,
    properties: db.properties.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      ...(p.options ? { options: p.options } : {}),
      ...(p.wrap ? { wrap: p.wrap } : {}),
      ...(p.formula ? { formula: p.formula } : {}),
    })),
    rows: db.rows.map((r) => ({
      id: r.id,
      cells: r.cells,
      createdAt: r.createdAt,
      ...(r.updatedAt ? { updatedAt: r.updatedAt } : {}),
      ...(r.seq !== undefined ? { seq: r.seq } : {}),
    })),
  };
  return JSON.stringify(data, null, 2);
}

export function exportToCSV(db: Database): string {
  const headers = db.properties.map((p) => csvEscape(p.name));
  const lines = [headers.join(",")];
  for (const row of db.rows) {
    const cells = db.properties.map((p) => csvEscape(cellToText(exportValue(db, row, p), p)));
    lines.push(cells.join(","));
  }
  return lines.join("\r\n");
}

export function exportToMarkdown(db: Database): string {
  const headers = db.properties.map((p) => p.name.replace(/\|/g, "\\|"));
  const separator = headers.map(() => "---");
  const lines = [`| ${headers.join(" | ")} |`, `| ${separator.join(" | ")} |`];
  for (const row of db.rows) {
    const cells = db.properties.map((p) =>
      cellToText(exportValue(db, row, p), p).replace(/\|/g, "\\|").replace(/\n/g, " ")
    );
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}
