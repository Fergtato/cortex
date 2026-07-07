import { useState } from "react";
import {
  SELECT_COLORS,
  type CellValue,
  type PropertyDef,
  type SelectOption,
} from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";

interface Props {
  dbId: string;
  prop: PropertyDef;
  value: CellValue;
  store: Store;
  onChange: (value: CellValue) => void;
}

/**
 * Select / multiselect cell: coloured display plus a popover for choosing,
 * creating, renaming, recolouring, and deleting options.
 */
export function SelectCell({ dbId, prop, value, store, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const dialog = useDialog();

  const multi = prop.type === "multiselect";
  const options = prop.options ?? [];
  const selectedIds = multi
    ? Array.isArray(value)
      ? value
      : []
    : typeof value === "string" && value
    ? [value]
    : [];
  const selected = selectedIds
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is SelectOption => Boolean(o));

  const setOption = (id: string) => {
    if (multi) {
      onChange(
        selectedIds.includes(id)
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id]
      );
    } else {
      onChange(id === selectedIds[0] ? null : id);
      setOpen(false);
    }
  };

  const addOption = () => {
    const name = draft.trim();
    if (!name) return;
    const existing = options.find((o) => o.name === name);
    const id = existing ? existing.id : store.addSelectOption(dbId, prop.id, name);
    setDraft("");
    if (multi) {
      if (!selectedIds.includes(id)) onChange([...selectedIds, id]);
    } else {
      onChange(id);
      setOpen(false);
    }
  };

  const single = !multi && selected[0];

  return (
    <div className="cell-selectwrap">
      <div
        className={`cell-select-display${single ? ` selc-${single.color} tinted` : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Click to edit"
      >
        {multi ? (
          selected.length ? (
            selected.map((o) => (
              <span key={o.id} className={`cell-pill selc-${o.color}`}>
                {o.name}
              </span>
            ))
          ) : (
            <span className="cell-select-empty">—</span>
          )
        ) : single ? (
          <span className="cell-select-name">{single.name}</span>
        ) : (
          <span className="cell-select-empty">—</span>
        )}
      </div>

      {open && (
        <>
          <div
            className="filter-pop-backdrop"
            onMouseDown={() => {
              setOpen(false);
              setEditingId(null);
            }}
          />
          <div className="filter-pop select-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="select-pop-new">
              <input
                className="filter-pop-input"
                placeholder={options.length ? "Find or add option…" : "Add an option…"}
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addOption();
                  if (e.key === "Escape") setOpen(false);
                }}
              />
            </div>
            <div className="select-pop-list">
              {!multi && selectedIds.length > 0 && (
                <div
                  className="select-pop-row"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <span className="select-pop-clear">✕ clear</span>
                </div>
              )}
              {options
                .filter((o) =>
                  draft.trim()
                    ? o.name.toLowerCase().includes(draft.trim().toLowerCase())
                    : true
                )
                .map((o) =>
                  editingId === o.id ? (
                    <OptionEditor
                      key={o.id}
                      option={o}
                      onRename={(name) =>
                        store.updateSelectOption(dbId, prop.id, o.id, { name })
                      }
                      onRecolor={(color) =>
                        store.updateSelectOption(dbId, prop.id, o.id, { color })
                      }
                      onDelete={async () => {
                        const ok = await dialog.confirm(
                          `Delete option "${o.name}"? It will be removed from all rows.`,
                          { confirmLabel: "delete", danger: true }
                        );
                        if (ok) {
                          store.deleteSelectOption(dbId, prop.id, o.id);
                          setEditingId(null);
                        }
                      }}
                      onClose={() => setEditingId(null)}
                    />
                  ) : (
                    <div key={o.id} className="select-pop-row" onClick={() => setOption(o.id)}>
                      <span className={`cell-pill selc-${o.color}`}>{o.name}</span>
                      {selectedIds.includes(o.id) && (
                        <span className="select-pop-check">✓</span>
                      )}
                      <button
                        className="select-pop-edit"
                        title="Edit option"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(o.id);
                        }}
                      >
                        ✎
                      </button>
                    </div>
                  )
                )}
              {draft.trim() &&
                !options.some(
                  (o) => o.name.toLowerCase() === draft.trim().toLowerCase()
                ) && (
                  <div className="select-pop-row" onClick={addOption}>
                    <span className="select-pop-create">
                      + create “{draft.trim()}”
                    </span>
                  </div>
                )}
              {options.length === 0 && !draft.trim() && (
                <span className="filter-hint select-pop-hint">
                  type a name and press enter
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OptionEditor({
  option,
  onRename,
  onRecolor,
  onDelete,
  onClose,
}: {
  option: SelectOption;
  onRename: (name: string) => void;
  onRecolor: (color: SelectOption["color"]) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="select-opt-editor">
      <div className="select-opt-editor-head">
        <input
          className="filter-pop-input"
          value={option.name}
          autoFocus
          onChange={(e) => onRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") onClose();
          }}
        />
        <button className="filter-pop-del" title="Delete option" onClick={onDelete}>
          ×
        </button>
        <button className="filter-pop-del" title="Done" onClick={onClose}>
          ✓
        </button>
      </div>
      <div className="select-opt-colors">
        {SELECT_COLORS.map((c) => (
          <button
            key={c}
            className={`select-swatch selc-${c}${option.color === c ? " active" : ""}`}
            title={c}
            onClick={() => onRecolor(c)}
          />
        ))}
      </div>
    </div>
  );
}
