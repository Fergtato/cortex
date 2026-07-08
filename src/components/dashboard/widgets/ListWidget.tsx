import { useState, type DragEvent as ReactDragEvent } from "react";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";

interface ListItem {
  id: string;
  text: string;
  done: boolean;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function itemsOf(config: Record<string, unknown>): ListItem[] {
  return Array.isArray(config.items) ? (config.items as ListItem[]) : [];
}

/**
 * Standalone checklist stored in `config.items`. Check/add/delete work in
 * both modes (ticking a habit is the point of a dashboard); drag the handle
 * to reorder. A Stage-7 action button will be able to reset all checks.
 */
export function ListWidget({ widget, dash, store, editing }: WidgetProps) {
  const items = itemsOf(widget.config);
  const title = typeof widget.config.title === "string" ? widget.config.title : "";
  const [draft, setDraft] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const setItems = (next: ListItem[]) =>
    patchWidgetConfig(store, dash.id, widget.id, { items: next });

  function add() {
    const text = draft.trim();
    if (!text) return;
    setItems([...items, { id: uid(), text, done: false }]);
    setDraft("");
  }

  function drop(e: ReactDragEvent, to: number) {
    e.preventDefault();
    setOverIdx(null);
    const from = dragIdx;
    setDragIdx(null);
    if (from === null || from === to) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, moved);
    setItems(next);
  }

  return (
    <div className="dw-list" onPointerDown={(e) => e.stopPropagation()}>
      {title && <div className="dw-list-title">{title}</div>}
      <ul className="dw-list-items">
        {items.map((item, i) => (
          <li
            key={item.id}
            className={
              `dw-list-item${item.done ? " done" : ""}` +
              `${overIdx === i && dragIdx !== null && dragIdx !== i ? " drop-before" : ""}`
            }
            onDragOver={(e) => {
              if (dragIdx === null) return;
              e.preventDefault();
              setOverIdx(i);
            }}
            onDragLeave={() => setOverIdx((o) => (o === i ? null : o))}
            onDrop={(e) => drop(e, i)}
          >
            <span
              className="dw-list-grip"
              title="drag to reorder"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                setDragIdx(i);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
            >
              ⣿
            </span>
            <span className="cell-checkbox-wrap">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  setItems(items.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it)))
                }
              />
            </span>
            <span className="dw-list-text">{item.text}</span>
            <button
              className="row-btn dw-list-del"
              title="Delete item"
              onClick={() => setItems(items.filter((it) => it.id !== item.id))}
            >
              ×
            </button>
          </li>
        ))}
        {/* tail drop zone so an item can be dragged to the end */}
        {dragIdx !== null && (
          <li
            className={`dw-list-tail${overIdx === items.length ? " drop-before" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIdx(items.length);
            }}
            onDrop={(e) => drop(e, items.length)}
          />
        )}
      </ul>
      {items.length === 0 && !editing && <div className="dw-text-empty">empty list</div>}
      <input
        className="dw-list-input"
        value={draft}
        placeholder="+ add item"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") add();
        }}
      />
    </div>
  );
}

export function ListConfigForm({ widget, dash, store }: WidgetProps) {
  const title = typeof widget.config.title === "string" ? widget.config.title : "";
  const items = itemsOf(widget.config);
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">list title</label>
      <input
        className="cell-input dw-config-input"
        value={title}
        placeholder="e.g. daily habits"
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <button
        className="meta-btn"
        disabled={items.every((it) => !it.done)}
        onClick={() => set({ items: items.map((it) => ({ ...it, done: false })) })}
      >
        ↺ uncheck all
      </button>
    </div>
  );
}
