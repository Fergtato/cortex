import { useRef, useState } from "react";
import {
  SELECT_COLORS,
  type CellValue,
  type PropertyDef,
  type SelectOption,
} from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";

/** Estimated max popover height, used to flip above the cell near the bottom. */
const POP_EST_HEIGHT = 340;
const POP_MIN_WIDTH = 230;

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
  // Fixed-position coordinates so the popover escapes overflow containers
  // (the table's horizontal scroller, gallery cards, kanban columns).
  const [popPos, setPopPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const displayRef = useRef<HTMLDivElement>(null);
  const dialog = useDialog();

  const toggleOpen = () => {
    if (!open) {
      const rect = displayRef.current?.getBoundingClientRect();
      if (rect) {
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - POP_MIN_WIDTH - 8));
        let top = rect.bottom + 4;
        if (top + POP_EST_HEIGHT > window.innerHeight) {
          top = Math.max(8, rect.top - POP_EST_HEIGHT - 4);
        }
        setPopPos({ left, top });
      }
    }
    setOpen((o) => !o);
  };

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
        ref={displayRef}
        className={`cell-select-display${single ? ` selc-${single.color} tinted` : ""}`}
        onClick={toggleOpen}
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
          <div
            className="filter-pop select-pop"
            // Fixed positioning so no overflow:hidden/auto ancestor can clip it.
            style={{ position: "fixed", left: popPos.left, top: popPos.top }}
            onMouseDown={(e) => e.stopPropagation()}
          >
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
