import { useEffect, useRef, useState } from "react";
import type { Database } from "../../types";
import { exportToCSV, exportToJSON, exportToMarkdown } from "../../lib/exportDB";

interface Props {
  db: Database;
}

type Format = "json" | "csv" | "md";

function sanitizeFileName(name: string): string {
  return (name || "database").replace(/[^\w.-]+/g, "_").slice(0, 80) || "database";
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const FORMAT_LABEL: Record<Format, string> = {
  json: "json",
  csv: "csv",
  md: "md",
};

export function ExportControls({ db }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function doExport(fmt: Format) {
    const base = sanitizeFileName(db.name);
    switch (fmt) {
      case "json":
        download(`${base}.json`, exportToJSON(db), "application/json");
        break;
      case "csv":
        download(`${base}.csv`, exportToCSV(db), "text/csv");
        break;
      case "md":
        download(`${base}.md`, exportToMarkdown(db), "text/markdown");
        break;
    }
    setOpen(false);
  }

  return (
    <div className="export-wrap" ref={wrapRef}>
      <button
        className="export-btn"
        title="Export database"
        onClick={() => setOpen((v) => !v)}
      >
        export ▾
      </button>
      {open && (
        <div className="export-menu" role="menu">
          {(Object.keys(FORMAT_LABEL) as Format[]).map((fmt) => (
            <button
              key={fmt}
              className="export-item"
              role="menuitem"
              onClick={() => doExport(fmt)}
            >
              {FORMAT_LABEL[fmt]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
