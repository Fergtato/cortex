import type { DatabaseRow, PropertyDef, PropertyType } from "../types";

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
    t === "date" ||
    t === "checkbox" ||
    t === "url" ||
    t === "image"
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

  const properties: PropertyDef[] = data.properties.map((p: any, i: number) => {
    const type = isPropertyType(p.type) ? p.type : "text";
    const def: PropertyDef = {
      id: typeof p.id === "string" ? p.id : uid(),
      name: typeof p.name === "string" && p.name ? p.name : `Column ${i + 1}`,
      type,
    };
    if (type === "select") {
      def.options = Array.isArray(p.options)
        ? p.options.filter((o: any) => typeof o === "string")
        : [];
    }
    return def;
  });

  if (properties.length === 0) return null;

  const propIds = new Set(properties.map((p) => p.id));
  const rows: DatabaseRow[] = data.rows.map((r: any) => {
    const cells: Record<string, unknown> = {};
    if (r && typeof r === "object" && r.cells && typeof r.cells === "object") {
      for (const [k, v] of Object.entries(r.cells)) {
        if (propIds.has(k)) {
          if (
            v === null ||
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
          ) {
            cells[k] = v;
          }
        }
      }
    }
    return {
      id: typeof r?.id === "string" ? r.id : uid(),
      cells: cells as DatabaseRow["cells"],
      createdAt: typeof r?.createdAt === "number" ? r.createdAt : Date.now(),
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
    };
  });

  return {
    name: dbName || "Imported CSV",
    properties,
    rows,
  };
}
