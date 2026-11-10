import type { DatabaseRow, PropertyDef, PropertyType } from "../types";
import { normalizeOptions } from "../storage/migrateDatabases";

export interface ImportData {
  name: string;
  properties: PropertyDef[];
  rows: DatabaseRow[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function isPropertyType(t: unknown): t is PropertyType {
  return (
    t === "text" ||
    t === "number" ||
    t === "select" ||
    t === "multiselect" ||
    t === "date" ||
    t === "checkbox" ||
    t === "url" ||
    t === "image" ||
    t === "formula" ||
    t === "created_time" ||
    t === "last_edited_time" ||
    t === "auto_id"
  );
}

export function importFromJSON(text: string): ImportData | null {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  if (!Array.isArray(data.properties) || !Array.isArray(data.rows)) return null;

  // Legacy exports carry string[] select options and option-*name* cell
  // values; current exports carry SelectOption objects and option-id values.
  // normalizeOptions handles both; nameToId remaps legacy values below.
  const nameToId = new Map<string, Map<string, string>>();
  const properties: PropertyDef[] = data.properties.map((p: any, i: number) => {
    const type = isPropertyType(p.type) ? p.type : "text";
    const def: PropertyDef = {
      id: typeof p.id === "string" ? p.id : uid(),
      name: typeof p.name === "string" && p.name ? p.name : `Column ${i + 1}`,
      type,
    };
    if (type === "select" || type === "multiselect") {
      const { options, byName } = normalizeOptions(p.options);
      def.options = options;
      nameToId.set(def.id, byName);
    }
    if (typeof p.wrap === "boolean") def.wrap = p.wrap;
    if (typeof p.formula === "string") def.formula = p.formula;
    return def;
  });

  if (properties.length === 0) return null;

  const selectProps = new Map(
    properties.filter((p) => p.options).map((p) => [p.id, p])
  );
  const remapSelect = (propId: string, v: string): string => {
    const prop = selectProps.get(propId);
    if (!prop) return v;
    if (prop.options!.some((o) => o.id === v)) return v; // already an id
    const byName = nameToId.get(propId);
    const mapped = byName?.get(v);
    if (mapped) return mapped;
    // Unknown value — create an option for it so nothing is lost.
    const opt = { id: uid(), name: v, color: "gray" as const };
    prop.options!.push(opt);
    byName?.set(v, opt.id);
    return opt.id;
  };

  const propIds = new Set(properties.map((p) => p.id));
  const rows: DatabaseRow[] = data.rows.map((r: any, ri: number) => {
    const cells: Record<string, unknown> = {};
    if (r && typeof r === "object" && r.cells && typeof r.cells === "object") {
      for (const [k, v] of Object.entries(r.cells)) {
        if (!propIds.has(k)) continue;
        if (Array.isArray(v)) {
          cells[k] = v
            .filter((x): x is string => typeof x === "string")
            .map((x) => remapSelect(k, x));
        } else if (typeof v === "string" && v && selectProps.has(k)) {
          cells[k] = remapSelect(k, v);
        } else if (
          v === null ||
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean"
        ) {
          cells[k] = v;
        }
      }
    }
    return {
      id: typeof r?.id === "string" ? r.id : uid(),
      cells: cells as DatabaseRow["cells"],
      createdAt: typeof r?.createdAt === "number" ? r.createdAt : Date.now(),
      ...(typeof r?.updatedAt === "number" ? { updatedAt: r.updatedAt } : {}),
      seq: typeof r?.seq === "number" ? r.seq : ri + 1,
    };
  });

  return {
    name: typeof data.name === "string" && data.name ? data.name : "Imported database",
    properties,
    rows,
  };
}

// Minimal RFC-4180-ish CSV parser: supports quoted fields, doubled-quote
// escaping, and newlines inside quoted fields.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushField();
      } else if (ch === "\n") {
        pushField();
        pushRow();
      } else if (ch === "\r") {
        // Skip — handled by the following \n
      } else {
        field += ch;
      }
    }
  }
  // Flush trailing field/row (file without final newline).
  if (field !== "" || row.length > 0) {
    pushField();
    pushRow();
  }
  // Drop a single trailing empty row caused by a final newline.
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    if (last.length === 1 && last[0] === "") rows.pop();
  }
  return rows;
}

export function importFromCSV(text: string, dbName?: string): ImportData | null {
  const parsed = parseCSV(text);
  if (parsed.length < 2) return null;
  const headerCells = parsed[0];
  if (headerCells.length === 0) return null;

  const properties: PropertyDef[] = headerCells.map((h, i) => ({
    id: uid(),
    name: h.trim() || `Column ${i + 1}`,
    type: "text",
  }));

  const rows: DatabaseRow[] = parsed.slice(1).map((cells, ri) => {
    const rowCells: Record<string, string | null> = {};
    properties.forEach((p, ci) => {
      const v = cells[ci];
      rowCells[p.id] = v === undefined ? null : v;
    });
    return {
      id: uid(),
      cells: rowCells,
      createdAt: Date.now() + ri,
      seq: ri + 1,
    };
  });

  return {
    name: dbName || "Imported CSV",
    properties,
    rows,
  };
}
