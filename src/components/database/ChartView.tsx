import type {
  ChartAgg,
  ChartConfig,
  ChartKind,
  Database,
  DatabaseRow,
  DatabaseView,
} from "../../types";
import { CHART_KINDS } from "../../types";
import type { Store } from "../../store";
import { ChartBody } from "./ChartBody";

interface Props {
  db: Database;
  store: Store;
  /** Rows already filtered/sorted by the view (DatabaseBlock does this). */
  rows: DatabaseRow[];
  view: DatabaseView;
  minimal?: boolean;
}

export function chartConfigOf(view: DatabaseView): ChartConfig {
  return view.chart ?? { kind: "bar" };
}

/**
 * Database chart view: a config strip (kind / x / y / aggregation / series)
 * over the shared SVG chart renderer. Settings persist on the view, like
 * filters — shared everywhere the view is shown.
 */
export function ChartView({ db, store, rows, view, minimal = false }: Props) {
  const cfg = chartConfigOf(view);
  const patch = (p: Partial<ChartConfig>) =>
    store.updateView(db.id, view.id, { chart: { ...cfg, ...p } });

  const numericish = db.properties.filter((p) =>
    ["number", "formula", "auto_id"].includes(p.type)
  );
  const selects = db.properties.filter((p) => p.type === "select");

  return (
    <div className="chart-view">
      {!minimal && (
        <div className="chart-config">
          <select
            className="dw-config-select chart-config-item"
            value={cfg.kind}
            onChange={(e) => patch({ kind: e.target.value as ChartKind })}
          >
            {CHART_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <span className="chart-config-label">x</span>
          <select
            className="dw-config-select chart-config-item"
            value={cfg.xPropId ?? ""}
            onChange={(e) => patch({ xPropId: e.target.value || null })}
          >
            <option value="">— property —</option>
            {db.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="chart-config-label">y</span>
          <select
            className="dw-config-select chart-config-item"
            value={cfg.yPropId ?? ""}
            onChange={(e) => patch({ yPropId: e.target.value || null })}
          >
            <option value="">row count</option>
            {numericish.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {cfg.yPropId && (
            <select
              className="dw-config-select chart-config-item"
              value={cfg.yAgg ?? "sum"}
              onChange={(e) => patch({ yAgg: e.target.value as ChartAgg })}
            >
              {(["sum", "avg", "min", "max"] as const).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
          {cfg.kind === "multiline" && (
            <>
              <span className="chart-config-label">series</span>
              <select
                className="dw-config-select chart-config-item"
                value={cfg.seriesPropId ?? ""}
                onChange={(e) => patch({ seriesPropId: e.target.value || null })}
              >
                <option value="">— select property —</option>
                {selects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      )}
      <ChartBody db={db} rows={rows} config={cfg} />
    </div>
  );
}
