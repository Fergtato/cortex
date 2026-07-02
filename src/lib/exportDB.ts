import type { Database } from "../types";

function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
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
    })),
    rows: db.rows.map((r) => ({
      id: r.id,
      cells: r.cells,
      createdAt: r.createdAt,
    })),
  };
  return JSON.stringify(data, null, 2);
}

export function exportToCSV(db: Database): string {
  const headers = db.properties.map((p) => csvEscape(p.name));
  const lines = [headers.join(",")];
  for (const row of db.rows) {
    const cells = db.properties.map((p) => csvEscape(cellToText(row.cells[p.id])));
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
      cellToText(row.cells[p.id]).replace(/\|/g, "\\|").replace(/\n/g, " ")
    );
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}
