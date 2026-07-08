import type { AggOp } from "../../../types";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { DbSelect, ViewSelect, PropSelect, strConf } from "./dbShared";
import { viewRows } from "../../database/viewRows";
import { aggregate, AGG_OPS } from "../../database/aggregate";
import { computedCellValue } from "../../../lib/formula";

function opOf(config: Record<string, unknown>): AggOp {
  const v = config.op;
  return AGG_OPS.some((o) => o.value === v) ? (v as AggOp) : "count";
}

/**
 * Big-number readout: an aggregation over a database, optionally through a
 * view's filters (e.g. "count of tasks in the *todo today* view"). With no
 * property chosen it counts rows; otherwise it runs the chosen AggOp over the
 * property's (computed) values.
 */
export function MetricWidget({ widget, store }: WidgetProps) {
  const dbId = strConf(widget.config, "databaseId");
  const viewId = strConf(widget.config, "viewId");
  const propId = strConf(widget.config, "propId");
  const label = strConf(widget.config, "label");
  const db = dbId ? store.getDatabase(dbId) : undefined;

  if (!db) {
    return <div className="dw-unconfigured">choose a database in ⚙</div>;
  }

  const view = db.views.find((v) => v.id === viewId); // undefined = all rows
  const rows = viewRows(db, view);
  const prop = db.properties.find((p) => p.id === propId);

  const value = prop
    ? aggregate(opOf(widget.config), rows.map((r) => computedCellValue(db, r, prop)))
    : String(rows.length);

  const caption =
    label ||
    (prop
      ? `${opOf(widget.config)} of ${prop.name} · ${db.name}`
      : `rows · ${db.name}${view ? ` / ${view.name}` : ""}`);

  return (
    <div className="dw-metric">
      <div className="dw-metric-value">{value}</div>
      <div className="dw-metric-label">{caption}</div>
    </div>
  );
}

export function MetricConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const dbId = strConf(widget.config, "databaseId");
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const propId = strConf(widget.config, "propId");

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">database</label>
      <DbSelect
        store={store}
        value={dbId}
        onChange={(id) => set({ databaseId: id, viewId: "", propId: "" })}
      />
      <label className="dw-config-label">view (filters rows)</label>
      <ViewSelect
        db={db}
        value={strConf(widget.config, "viewId")}
        onChange={(id) => set({ viewId: id })}
        allowAll
      />
      <label className="dw-config-label">property</label>
      <PropSelect
        db={db}
        value={propId}
        onChange={(id) => set({ propId: id })}
        emptyLabel="row count"
      />
      {propId && (
        <>
          <label className="dw-config-label">aggregation</label>
          <select
            className="dw-config-select"
            value={opOf(widget.config)}
            onChange={(e) => set({ op: e.target.value })}
          >
            {AGG_OPS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </>
      )}
      <label className="dw-config-label">label (optional)</label>
      <input
        className="cell-input dw-config-input"
        value={strConf(widget.config, "label")}
        placeholder="e.g. tasks remaining"
        onChange={(e) => set({ label: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
