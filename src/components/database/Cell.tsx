import type { CellValue, PropertyDef } from "../../types";
import type { Store } from "../../store";
import { pickImage } from "../../lib/image";
import { SelectCell } from "./SelectCell";

interface Props {
  dbId: string;
  prop: PropertyDef;
  value: CellValue;
  store: Store;
  onChange: (value: CellValue) => void;
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

