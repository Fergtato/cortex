import type { CellValue, PropertyDef } from "../../types";
import { useDialog } from "../Dialog";
import { pickImage } from "../../lib/image";

interface Props {
  prop: PropertyDef;
  value: CellValue;
  onChange: (value: CellValue) => void;
  /** Lets a select property gain a new option on the fly. */
  onAddOption?: (option: string) => void;
}

export function Cell({ prop, value, onChange, onAddOption }: Props) {
  const dialog = useDialog();

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
      return (
        <input
          type="text"
          className="cell-input"
          placeholder="https://…"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
        />
      );

    case "select": {
      const ADD = "__add__";
      const options = prop.options ?? [];
      return (
        <select
          className="cell-input cell-select"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => {
            if (e.target.value === ADD) {
              dialog.prompt("New option:").then((raw) => {
                const next = raw?.trim();
                if (next) {
                  onAddOption?.(next);
                  onChange(next);
                }
              });
              return;
            }
            onChange(e.target.value || null);
          }}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={ADD}>+ new option…</option>
        </select>
      );
    }

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

