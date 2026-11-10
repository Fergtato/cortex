import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { DbSelect, ViewSelect, strConf } from "./dbShared";
import { DatabaseBlock } from "../../database/DatabaseBlock";
import { useNav } from "../../../context";

/**
 * Embeds one of a database's views. Only `{databaseId, viewId}` is persisted
 * here — filters/sort live on the view itself (shared everywhere it shows).
 * Rendered minimal + schema-locked so it fits a grid cell; data stays
 * editable inline.
 */
export function DbViewWidget({ widget, store }: WidgetProps) {
  const nav = useNav();
  const dbId = strConf(widget.config, "databaseId");
  const viewId = strConf(widget.config, "viewId");
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const view = db?.views.find((v) => v.id === viewId) ?? db?.views[0];

  if (!db || !view) {
    return <div className="dw-unconfigured">choose a database in ⚙</div>;
  }

  return (
    <div className="dw-dbview" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dw-dbview-head">
        <button
          className="dw-dbview-link"
          title="Open database"
          onClick={() => nav.openDatabase(db.id)}
        >
          {db.name || "untitled"} / {view.name} ↗
        </button>
      </div>
      <div className="dw-dbview-body">
        <DatabaseBlock db={db} store={store} embedded lockSchema minimal viewId={view.id} />
      </div>
    </div>
  );
}

export function DbViewConfigForm({ widget, dash, store }: WidgetProps) {
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
        onChange={(id) => set({ databaseId: id, viewId: "" })}
      />
      <label className="dw-config-label">view</label>
      <ViewSelect
        db={db}
        value={strConf(widget.config, "viewId")}
        onChange={(id) => set({ viewId: id })}
      />
    </div>
  );
}
