import { useLayoutEffect, useRef } from "react";
import type { CellValue, DatabaseRow, PropertyDef } from "../../types";
import type { Store } from "../../store";
import { pickImage } from "../../lib/image";
import { SelectCell } from "./SelectCell";

interface Props {
  dbId: string;
  prop: PropertyDef;
  value: CellValue;
  store: Store;
  onChange: (value: CellValue) => void;
  /** The row, for computed cells (created/edited time, auto id, formulas). */
  row?: DatabaseRow;
}

/** Auto-growing textarea for wrapped text columns: shows all content. */
function WrapTextCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string | null) => void;
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
      className="cell-input cell-textarea"
      value={value}
      onChange={(e) => onChange(e.target.value || null)}
    />
  );
}

export function Cell({ dbId, prop, value, store, onChange }: Props) {

  switch (prop.type) {
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
          <WrapTextCell value={typeof value === "string" ? value : ""} onChange={onChange} />
        );
      }
      return (
        <input
          type="text"
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
          <img src={value} className="cell-image-thumb" alt="" />
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
          <WrapTextCell value={typeof value === "string" ? value : ""} onChange={onChange} />
        );
      }
      return (
        <input
          type="text"
          className="cell-input"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );
  }
}

