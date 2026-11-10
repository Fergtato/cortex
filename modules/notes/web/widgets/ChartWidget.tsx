import type { ChartAgg, ChartConfig, ChartKind } from "../types";
import { CHART_KINDS } from "../types";
import type { WidgetProps } from "@cortex/core";
import { useStoreContext } from "../context";
import { DbSelect, ViewSelect, PropSelect, strConf } from "./dbShared";
import { viewRows } from "../components/database/viewRows";
import { ChartBody } from "../components/database/ChartBody";

function chartConfigOf(config: Record<string, unknown>): ChartConfig {
  const kind = CHART_KINDS.includes(config.kind as ChartKind)
    ? (config.kind as ChartKind)
    : "bar";
  return {
    kind,
    xPropId: strConf(config, "xPropId") || null,
    yPropId: strConf(config, "yPropId") || null,
    yAgg: (["sum", "avg", "min", "max"] as const).includes(config.yAgg as ChartAgg)
      ? (config.yAgg as ChartAgg)
      : "sum",
    seriesPropId: strConf(config, "seriesPropId") || null,
  };
}

/**
 * Standalone dashboard chart: its own chart settings over any database,
 * optionally through a view's filters. Reuses the shared ChartBody renderer
 * (same SVG engine as the database "chart" view).
 */
export function ChartWidget({ widget }: WidgetProps) {
  const store = useStoreContext();
  const dbId = strConf(widget.config, "databaseId");
  const viewId = strConf(widget.config, "viewId");
  const label = strConf(widget.config, "label");
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const cfg = chartConfigOf(widget.config);

  if (!db || !cfg.xPropId) {
    return <div className="dw-unconfigured">Choose a database + x axis in settings</div>;
  }

  const view = db.views.find((v) => v.id === viewId); // undefined = all rows
  const rows = viewRows(db, view);

  return (
    <div className="dw-chart">
      {label && <div className="dw-chart-label">{label}</div>}
      <ChartBody db={db} rows={rows} config={cfg} />
    </div>
  );
}

export function ChartConfigForm({ widget, dash }: WidgetProps) {
  const store = useStoreContext();
  const set = (patch: Record<string, unknown>) =>
    dash.patchWidget(widget.id, patch);
  const dbId = strConf(widget.config, "databaseId");
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const cfg = chartConfigOf(widget.config);

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">Database</label>
      <DbSelect
        store={store}
        value={dbId}
        onChange={(id) =>
          set({ databaseId: id, viewId: "", xPropId: "", yPropId: "", seriesPropId: "" })
        }
      />
      <label className="dw-config-label">View (filters rows)</label>
      <ViewSelect
        db={db}
        value={strConf(widget.config, "viewId")}
        onChange={(id) => set({ viewId: id })}
        allowAll
      />
      <label className="dw-config-label">Chart</label>
      <div className="dw-config-row-btns">
        {CHART_KINDS.map((k) => (
          <button
            key={k}
            className={`opt-btn${cfg.kind === k ? " active" : ""}`}
            onClick={() => set({ kind: k })}
          >
            {k === "multiline" ? "Multi-line" : k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <label className="dw-config-label">X axis</label>
      <PropSelect
        db={db}
        value={cfg.xPropId ?? ""}
        onChange={(id) => set({ xPropId: id })}
        emptyLabel="Choose property"
      />
      <label className="dw-config-label">Y value</label>
      <PropSelect
        db={db}
        value={cfg.yPropId ?? ""}
        onChange={(id) => set({ yPropId: id })}
        types={["number", "formula", "auto_id"]}
        emptyLabel="Row count"
      />
      {cfg.yPropId && (
        <div className="dw-config-row-btns">
          {(["sum", "avg", "min", "max"] as const).map((a) => (
            <button
              key={a}
              className={`opt-btn${cfg.yAgg === a ? " active" : ""}`}
              onClick={() => set({ yAgg: a })}
            >
              {a}
            </button>
          ))}
        </div>
      )}
      {cfg.kind === "multiline" && (
        <>
          <label className="dw-config-label">Series (select prop)</label>
          <PropSelect
            db={db}
            value={cfg.seriesPropId ?? ""}
            onChange={(id) => set({ seriesPropId: id })}
            types={["select"]}
            emptyLabel="Choose property"
          />
        </>
      )}
      <label className="dw-config-label">Label (optional)</label>
      <input
        className="cell-input dw-config-input"
        value={strConf(widget.config, "label")}
        placeholder="e.g. workouts by day"
        onChange={(e) => set({ label: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
