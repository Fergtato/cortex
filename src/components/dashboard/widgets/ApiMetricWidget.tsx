import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { strConf } from "./dbShared";
import { getPath } from "../../../lib/connections";
import { ConnectionSelect, useApiPoll } from "./apiShared";

function refreshOf(config: Record<string, unknown>): number {
  const v = Number(config.refreshSec);
  return Number.isFinite(v) && v > 0 ? v : 60;
}

/**
 * Big-number readout from a connected API: GET a path through the proxy on
 * an interval, pull one value out of the JSON with a dot path (e.g. Google
 * Health steps, a Homey sensor, a TMDB rating).
 */
export function ApiMetricWidget({ widget }: WidgetProps) {
  const connectionId = strConf(widget.config, "connectionId");
  const path = strConf(widget.config, "path");
  const valuePath = strConf(widget.config, "valuePath");
  const label = strConf(widget.config, "label");
  const suffix = strConf(widget.config, "suffix");
  const { data, error, loading } = useApiPoll(connectionId, path, refreshOf(widget.config));

  if (!connectionId || !path) {
    return <div className="dw-unconfigured">choose a connection + path in ⚙</div>;
  }

  let display: string;
  if (error) display = "—";
  else if (loading && data === null) display = "…";
  else {
    const v = getPath(data, valuePath);
    if (v === undefined || v === null) display = "—";
    else if (typeof v === "number") display = String(Math.round(v * 100) / 100);
    else if (typeof v === "boolean") display = v ? "true" : "false";
    else if (typeof v === "object") display = "{…}";
    else display = String(v);
  }

  return (
    <div className="dw-metric" title={error ?? undefined}>
      <div className={`dw-metric-value${error ? " dw-api-error" : ""}`}>
        {display}
        {suffix && !error && <span className="dw-metric-suffix">{suffix}</span>}
      </div>
      <div className="dw-metric-label">{label || path}</div>
    </div>
  );
}

export function ApiMetricConfigForm({ widget, dash, store }: WidgetProps) {
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
      {text("path", "e.g. sensors/steps/today")}
      <label className="dw-config-label">value (dot path into JSON)</label>
      {text("valuePath", "e.g. data.total — blank = whole response")}
      <label className="dw-config-label">label</label>
      {text("label", "e.g. steps today")}
      <label className="dw-config-label">suffix</label>
      {text("suffix", "e.g. kWh")}
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
