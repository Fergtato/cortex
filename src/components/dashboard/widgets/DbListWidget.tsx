import { useState } from "react";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { DbSelect, ViewSelect, PropSelect, strConf } from "./dbShared";
import { viewRows } from "../../database/viewRows";
import { useNav } from "../../../context";

/**
 * A compact checklist backed by a database. Rows come through a chosen view's
 * filters/sort (e.g. a "today" view); the checkbox toggles a chosen checkbox
 * property via store.updateCell. Typing in the footer adds a real row.
 */
export function DbListWidget({ widget, store }: WidgetProps) {
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

export function DbListConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const dbId = strConf(widget.config, "databaseId");
  const db = dbId ? store.getDatabase(dbId) : undefined;

  return (
    <div className="dw-config-form">
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
    </div>
  );
}
