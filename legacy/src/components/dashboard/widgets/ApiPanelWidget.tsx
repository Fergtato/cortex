import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { strConf } from "./dbShared";
import { getPath } from "../../../lib/connections";
import { ConnectionSelect, useApiPoll } from "./apiShared";

function refreshOf(config: Record<string, unknown>): number {
  const v = Number(config.refreshSec);
  return Number.isFinite(v) && v > 0 ? v : 30;
}

/**
 * Live status panel over a connected API: fetch a path, treat the result (or
 * a dot path into it) as a list, and render one row per item with a label,
 * an optional status text, and a health dot that goes green when the status
 * equals the configured "ok" value (red otherwise). The Docker preset case:
 * path `containers/json`, label `Names[0]`, status `State`, ok `running`.
 */
export function ApiPanelWidget({ widget }: WidgetProps) {
  const connectionId = strConf(widget.config, "connectionId");
  const path = strConf(widget.config, "path");
  const itemsPath = strConf(widget.config, "itemsPath");
  const labelPath = strConf(widget.config, "labelPath");
  const statusPath = strConf(widget.config, "statusPath");
  const okValue = strConf(widget.config, "okValue");
  const label = strConf(widget.config, "label");
  const { data, error, loading } = useApiPoll(connectionId, path, refreshOf(widget.config));

  if (!connectionId || !path) {
    return <div className="dw-unconfigured">choose a connection + path in ⚙</div>;
  }

  const raw = getPath(data, itemsPath);
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
    ? Object.values(raw)
    : [];

  return (
    <div className="dw-api-panel">
      <div className="dw-scifi-head">
        <span className={`dw-scifi-blink${error ? " dw-api-error" : ""}`}>●</span>{" "}
        {label || path}
        <span className="dw-api-panel-count">
          {error ? "offline" : loading && data === null ? "…" : items.length}
        </span>
      </div>
      <div className="dw-api-panel-body">
        {error && <div className="dw-text-empty">{error}</div>}
        {!error &&
          items.map((item, i) => {
            const name = String(getPath(item, labelPath) ?? `item ${i + 1}`).replace(/^\//, "");
            const status = statusPath ? getPath(item, statusPath) : undefined;
            const statusText = status === undefined ? "" : String(status);
            const health =
              !statusPath || !okValue ? "none" : statusText === okValue ? "ok" : "bad";
            return (
              <div key={i} className="dw-api-panel-row">
                <span className={`dw-api-dot dw-api-dot-${health}`}>●</span>
                <span className="dw-api-panel-name">{name}</span>
                {statusText && <span className="dw-api-panel-status">{statusText}</span>}
              </div>
            );
          })}
        {!error && !loading && items.length === 0 && (
          <div className="dw-text-empty">no items</div>
        )}
      </div>
    </div>
  );
}

export function ApiPanelConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const text = (key: string, placeholder: string) => (
    <input
      className="cell-input dw-config-input"
      value={strConf(widget.config, key)}
      placeholder={placeholder}
      onChange={(e) => set({ [key]: e.target.value })}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">connection</label>
      <ConnectionSelect
        value={strConf(widget.config, "connectionId")}
        onChange={(id) => set({ connectionId: id })}
      />
      <label className="dw-config-label">path</label>
      {text("path", "e.g. containers/json")}
      <label className="dw-config-label">items (dot path, blank = root)</label>
      {text("itemsPath", "e.g. data.devices")}
      <label className="dw-config-label">item label</label>
      {text("labelPath", "e.g. Names[0]")}
      <label className="dw-config-label">item status</label>
      {text("statusPath", "e.g. State")}
      <label className="dw-config-label">healthy when status is</label>
      {text("okValue", "e.g. running")}
      <label className="dw-config-label">panel label</label>
      {text("label", "e.g. CONTAINERS")}
      <label className="dw-config-label">refresh (seconds)</label>
      <input
        className="cell-input dw-config-input"
        type="number"
        min={5}
        value={refreshOf(widget.config)}
        onChange={(e) => set({ refreshSec: Number(e.target.value) })}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
