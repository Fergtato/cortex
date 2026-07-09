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

/** Property types counted by matching a value instead of numeric AggOps. */
function isMatchType(type: string | undefined): boolean {
  return type === "select" || type === "multiselect" || type === "checkbox";
}

/**
 * Big-number readout over a database, optionally through a view's filters.
 * No property = row count; numeric-ish properties aggregate (sum/avg/…);
 * select/multiselect/checkbox properties count rows matching a chosen value
 * (e.g. "how many todos have Status = done").
 */
export function MetricWidget({ widget, store }: WidgetProps) {
  const dbId = strConf(widget.config, "databaseId");
  const viewId = strConf(widget.config, "viewId");
  const propId = strConf(widget.config, "propId");
  const matchValue = strConf(widget.config, "matchValue");
  const label = strConf(widget.config, "label");
  const db = dbId ? store.getDatabase(dbId) : undefined;

  if (!db) {
    return <div className="dw-unconfigured">choose a database in ⚙</div>;
  }

  const view = db.views.find((v) => v.id === viewId); // undefined = all rows
  const rows = viewRows(db, view);
  const prop = db.properties.find((p) => p.id === propId);

  let value: string;
  let auto: string;
  if (!prop) {
    value = String(rows.length);
    auto = `rows · ${db.name}${view ? ` / ${view.name}` : ""}`;
  } else if (isMatchType(prop.type)) {
    // Count rows whose value matches the chosen option / checked state.
    const matches = rows.filter((r) => {
      const v = r.cells[prop.id];
      if (prop.type === "checkbox") return (v === true) === (matchValue !== "false");
      if (prop.type === "multiselect") return Array.isArray(v) && v.includes(matchValue);
      return v === matchValue;
    });
    value = String(matches.length);
    const optName =
      prop.type === "checkbox"
        ? matchValue === "false"
          ? "unchecked"
          : "checked"
        : prop.options?.find((o) => o.id === matchValue)?.name ?? "?";
    auto = `${prop.name} = ${optName} · ${db.name}`;
  } else {
    value = aggregate(opOf(widget.config), rows.map((r) => computedCellValue(db, r, prop)));
    auto = `${opOf(widget.config)} of ${prop.name} · ${db.name}`;
  }

  const caption = label || auto;

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
  const prop = db?.properties.find((p) => p.id === propId);

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">database</label>
      <DbSelect
        store={store}
        value={dbId}
        onChange={(id) => set({ databaseId: id, viewId: "", propId: "", matchValue: "" })}
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
        onChange={(id) => set({ propId: id, matchValue: "" })}
        emptyLabel="row count"
      />
      {prop && isMatchType(prop.type) && (
        <>
          <label className="dw-config-label">count rows where value is</label>
          {prop.type === "checkbox" ? (
            <div className="dw-config-row-btns">
              {(["true", "false"] as const).map((v) => (
                <button
                  key={v}
                  className={`opt-btn${
                    (strConf(widget.config, "matchValue") || "true") === v ? " active" : ""
                  }`}
                  onClick={() => set({ matchValue: v })}
                >
                  {v === "true" ? "checked" : "unchecked"}
                </button>
              ))}
            </div>
          ) : (
            <select
              className="dw-config-select"
              value={strConf(widget.config, "matchValue")}
              onChange={(e) => set({ matchValue: e.target.value })}
            >
              <option value="">— choose option —</option>
              {prop.options?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {prop && !isMatchType(prop.type) && (
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
