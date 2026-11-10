import { useLayoutEffect, useRef } from "react";
import type { CellValue, DatabaseRow, PropertyDef } from "../../types";
import type { Store } from "../../store";
import { pickImage } from "../../lib/image";
import { computedCellValue, formatComputed } from "../../lib/formula";
import { SelectCell } from "./SelectCell";
import { StoredImg } from "@cortex/core";

interface Props {
  dbId: string;
  prop: PropertyDef;
  value: CellValue;
  store: Store;
  onChange: (value: CellValue) => void;
  /** The row, for computed cells (created/edited time, auto id, formulas). */
  row?: DatabaseRow;
  /** Focus the text input on mount (the name cell of a freshly added row). */
  autoFocus?: boolean;
}

/** Auto-growing textarea for wrapped text columns: shows all content. */
function WrapTextCell({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (v: string | null) => void;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      autoFocus={autoFocus}
      className="cell-input cell-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function Cell({ dbId, prop, value, store, onChange, row, autoFocus }: Props) {
  switch (prop.type) {
    case "formula":
    case "created_time":
    case "last_edited_time":
    case "auto_id": {
      const db = store.getDatabase(dbId);
      const computed = db && row ? computedCellValue(db, row, prop) : null;
      const text = formatComputed(prop, computed);
      return (
        <span
          className={`cell-computed${text === "#ERR" || text === "#REF" ? " error" : ""}`}
          title={prop.type === "formula" ? prop.formula : undefined}
        >
          {text || "—"}
        </span>
      );
    }

    case "checkbox":
      return (
        <span className="cell-checkbox-wrap">
          <input
            type="checkbox"
            className="cell-checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
        </span>
      );

    case "number":
      return (
        <input
          type="number"
          className="cell-input"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      );

    case "date":
      return (
        <input
          type="date"
          className="cell-input cell-date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case "url":
      if (prop.wrap) {
        return (
          <WrapTextCell
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            autoFocus={autoFocus}
          />
        );
      }
      return (
        <input
          type="text"
          autoFocus={autoFocus}
          className="cell-input"
          placeholder="https://…"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case "select":
    case "multiselect":
      return (
        <SelectCell dbId={dbId} prop={prop} value={value} store={store} onChange={onChange} />
      );

    case "image": {
      const pick = async () => {
        const url = await pickImage();
        if (url) onChange(url);
      };
      return typeof value === "string" && value ? (
        <span className="cell-image">
          <StoredImg src={value} className="cell-image-thumb" alt="" />
          <button className="cell-image-btn" onClick={pick}>
            change
          </button>
          <button className="cell-image-btn" onClick={() => onChange(null)}>
            ×
          </button>
        </span>
      ) : (
        <button className="cell-image-add" onClick={pick}>
          + image
        </button>
      );
    }

    case "text":
    default:
      if (prop.wrap) {
        return (
          <WrapTextCell
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            autoFocus={autoFocus}
          />
        );
      }
      return (
        <input
          type="text"
          autoFocus={autoFocus}
          className="cell-input"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
  }
}

