import type { CellValue, PropertyDef } from "../../types";
import { useDialog } from "../Dialog";
import { pickImage } from "../../lib/image";

interface Props {
  prop: PropertyDef;
  value: CellValue;
  onChange: (value: CellValue) => void;
  /** Lets a select property gain a new option on the fly; returns its id. */
  onAddOption?: (name: string) => string;
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
                if (next && onAddOption) onChange(onAddOption(next));
              });
              return;
            }
            onChange(e.target.value || null);
          }}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
          <option value={ADD}>+ new option…</option>
        </select>
      );
    }

    case "multiselect": {
      const options = prop.options ?? [];
      const selected = Array.isArray(value) ? value : [];
      const toggle = (optId: string) =>
        onChange(
          selected.includes(optId)
            ? selected.filter((x) => x !== optId)
            : [...selected, optId]
        );
      return (
        <span className="cell-multiselect">
          {selected
            .map((id) => options.find((o) => o.id === id))
            .filter((o): o is NonNullable<typeof o> => Boolean(o))
            .map((o) => (
              <button
                key={o.id}
                className="cell-pill"
                title="Remove"
                onClick={() => toggle(o.id)}
              >
                {o.name} ×
              </button>
            ))}
          <button
            className="cell-pill-add"
            title="Add option"
            onClick={async () => {
              const remaining = options.filter((o) => !selected.includes(o.id));
              const choice = await dialog.choose("Add option:", [
                ...remaining.map((o) => ({ label: o.name, value: o.id })),
                { label: "＋ new option…", value: "__new__" },
              ]);
              if (!choice) return;
              if (choice === "__new__") {
                const raw = await dialog.prompt("New option:");
                const name = raw?.trim();
                if (name && onAddOption) onChange([...selected, onAddOption(name)]);
              } else {
                toggle(choice);
              }
            }}
          >
            +
          </button>
        </span>
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

