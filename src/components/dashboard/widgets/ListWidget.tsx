import { useState, type DragEvent as ReactDragEvent } from "react";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { DbSelect, ViewSelect, PropSelect, strConf } from "./dbShared";
import { viewRows } from "../../database/viewRows";
import { useNav } from "../../../context";

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

/** Old standalone "db-list" widgets default to database mode. */
function isDbMode(widget: WidgetProps["widget"]): boolean {
  if (widget.config.source === "database") return true;
  if (widget.config.source === "basic") return false;
  return widget.type === "db-list";
}

/**
 * The list widget, in two flavours chosen in ⚙: a basic checklist stored in
 * `config.items`, or a database-connected one whose rows come through a
 * chosen view's filters with a checkbox property to toggle. Checking works in
 * view mode — ticking habits is the point of a dashboard.
 */
export function ListWidget(props: WidgetProps) {
  return isDbMode(props.widget) ? <DbList {...props} /> : <LocalList {...props} />;
}

/* ------------------------------ basic list ----------------------------- */

function LocalList({ widget, dash, store, editing }: WidgetProps) {
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

/* --------------------------- database-backed --------------------------- */

function DbList({ widget, store }: WidgetProps) {
  const nav = useNav();
  const [draft, setDraft] = useState("");
  const dbId = strConf(widget.config, "databaseId");
  const viewId = strConf(widget.config, "viewId");
  const checkPropId = strConf(widget.config, "checkPropId");
  const db = dbId ? store.getDatabase(dbId) : undefined;

  if (!db) {
    return <div className="dw-unconfigured">choose a database in ⚙</div>;
  }

  const view = db.views.find((v) => v.id === viewId); // undefined = all rows
  const rows = viewRows(db, view);
  const titleProp = db.properties[0];
  const checkProp = db.properties.find((p) => p.id === checkPropId && p.type === "checkbox");

  function add() {
    const text = draft.trim();
    if (!text || !db) return;
    store.addRow(db.id, { [titleProp.id]: text });
    setDraft("");
  }

  return (
    <div className="dw-list" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dw-list-title">
        <button
          className="dw-dbview-link"
          title="Open database"
          onClick={() => nav.openDatabase(db.id)}
        >
          {db.name || "untitled"}
          {view ? ` / ${view.name}` : ""} ↗
        </button>
      </div>
      <ul className="dw-list-items">
        {rows.map((row) => {
          const done = checkProp ? row.cells[checkProp.id] === true : false;
          return (
            <li key={row.id} className={`dw-list-item${done ? " done" : ""}`}>
              {checkProp && (
                <span className="cell-checkbox-wrap">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => store.updateCell(db.id, row.id, checkProp.id, !done)}
                  />
                </span>
              )}
              <span className="dw-list-text">
                {String(row.cells[titleProp.id] ?? "") || "untitled"}
              </span>
              <button
                className="row-btn dw-list-del"
                title="Delete row"
                onClick={() => store.deleteRow(db.id, row.id)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <div className="dw-text-empty">no matching rows</div>}
      <input
        className="dw-list-input"
        value={draft}
        placeholder="+ add row"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") add();
        }}
      />
    </div>
  );
}

/* ------------------------------ config form ---------------------------- */

export function ListConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const dbMode = isDbMode(widget);
  const title = typeof widget.config.title === "string" ? widget.config.title : "";
  const items = itemsOf(widget.config);
  const dbId = strConf(widget.config, "databaseId");
  const db = dbId ? store.getDatabase(dbId) : undefined;

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">source</label>
      <div className="dw-config-row-btns">
        {(["basic", "database"] as const).map((s) => (
          <button
            key={s}
            className={`opt-btn${(dbMode ? "database" : "basic") === s ? " active" : ""}`}
            onClick={() => set({ source: s })}
          >
            {s}
          </button>
        ))}
      </div>

      {!dbMode && (
        <>
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
        </>
      )}

      {dbMode && (
        <>
          <label className="dw-config-label">database</label>
          <DbSelect
            store={store}
            value={dbId}
            onChange={(id) => set({ databaseId: id, viewId: "", checkPropId: "" })}
          />
          <label className="dw-config-label">view (filters rows)</label>
          <ViewSelect
            db={db}
            value={strConf(widget.config, "viewId")}
            onChange={(id) => set({ viewId: id })}
            allowAll
          />
          <label className="dw-config-label">checkbox property</label>
          <PropSelect
            db={db}
            value={strConf(widget.config, "checkPropId")}
            onChange={(id) => set({ checkPropId: id })}
            types={["checkbox"]}
            emptyLabel="none (read-only list)"
          />
        </>
      )}
    </div>
  );
}
