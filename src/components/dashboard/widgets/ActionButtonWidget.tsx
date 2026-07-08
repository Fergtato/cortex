import { useRef, useState } from "react";
import type { CellValue, Dashboard, PropertyDef, Widget } from "../../../types";
import type { Store } from "../../../store";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig, WIDGET_DEFS } from "./registry";
import { DbSelect, strConf } from "./dbShared";
import { viewRows } from "../../database/viewRows";
import { Cell } from "../../database/Cell";
import { isComputedType } from "../../../lib/formula";
import { Icon, isIconName } from "../../Icon";
import { IconPicker } from "../../IconPicker";
import type { SelectColor } from "../../../types";

type ButtonAction = "none" | "reset-list" | "create-row" | "swap-widgets" | "run-api";
type Appearance = "icon-text" | "text" | "icon";

interface RowDefault {
  propId: string;
  value: CellValue;
}

function isBlank(v: CellValue | undefined): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Human label for a widget in the target-picker selects. */
function describeWidget(w: Widget): string {
  const def = WIDGET_DEFS[w.type];
  const title =
    (typeof w.config.title === "string" && w.config.title) ||
    (typeof w.config.label === "string" && w.config.label) ||
    "";
  return `${def.glyph} ${def.label}${title ? ` "${title}"` : ""} @${w.x},${w.y}`;
}

function overlaps(a: Widget | { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

/** Checked/total progress of a (db-)list widget, for the live status badge. */
function listProgress(store: Store, target: Widget | undefined): string | null {
  if (!target) return null;
  if (target.type === "list") {
    const items = Array.isArray(target.config.items)
      ? (target.config.items as { done?: boolean }[])
      : [];
    if (items.length === 0) return null;
    return `${items.filter((i) => i.done).length}/${items.length}`;
  }
  if (target.type === "db-list") {
    const db = store.getDatabase(strConf(target.config, "databaseId"));
    const checkPropId = strConf(target.config, "checkPropId");
    if (!db || !checkPropId) return null;
    const view = db.views.find((v) => v.id === strConf(target.config, "viewId"));
    const rows = viewRows(db, view);
    if (rows.length === 0) return null;
    return `${rows.filter((r) => r.cells[checkPropId] === true).length}/${rows.length}`;
  }
  return null;
}

/**
 * A versatile button: reset a (db-)list on this dashboard, file a database
 * row from preset defaults, or swap two widgets' grid positions. Appearance:
 * text / icon / icon+text, with an optional live checked/total status when
 * the target is a list. `run-api` arrives with the connections stage.
 */
export function ActionButtonWidget({ widget, dash, store, editing }: WidgetProps) {
  const [flash, setFlash] = useState<"ok" | "fail" | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const cfg = widget.config;
  const action = (cfg.action as ButtonAction) ?? "none";
  const appearance = (cfg.appearance as Appearance) ?? "icon-text";
  const label = strConf(cfg, "label") || "button";
  const icon = strConf(cfg, "icon");
  const showStatus = cfg.showStatus === true;

  const target = dash.widgets.find((w) => w.id === strConf(cfg, "targetWidgetId"));
  const status = showStatus && action === "reset-list" ? listProgress(store, target) : null;

  function feedback(ok: boolean) {
    setFlash(ok ? "ok" : "fail");
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1200);
  }

  function resetList(): boolean {
    if (!target) return false;
    if (target.type === "list") {
      const items = Array.isArray(target.config.items)
        ? (target.config.items as { done?: boolean }[])
        : [];
      patchWidgetConfig(store, dash.id, target.id, {
        items: items.map((it) => ({ ...it, done: false })),
      });
      return true;
    }
    if (target.type === "db-list") {
      const db = store.getDatabase(strConf(target.config, "databaseId"));
      const checkPropId = strConf(target.config, "checkPropId");
      if (!db || !checkPropId) return false;
      const view = db.views.find((v) => v.id === strConf(target.config, "viewId"));
      for (const row of viewRows(db, view)) {
        if (row.cells[checkPropId] === true) {
          store.updateCell(db.id, row.id, checkPropId, false);
        }
      }
      return true;
    }
    return false;
  }

  function createRow(): boolean {
    const db = store.getDatabase(strConf(cfg, "databaseId"));
    const defaults = Array.isArray(cfg.defaults) ? (cfg.defaults as RowDefault[]) : [];
    const cells: Record<string, CellValue> = {};
    for (const d of defaults) {
      if (!isBlank(d.value)) cells[d.propId] = d.value;
    }
    if (!db || Object.keys(cells).length === 0) return false;
    store.addRow(db.id, cells);
    return true;
  }

  function swapWidgets(): boolean {
    const a = dash.widgets.find((w) => w.id === strConf(cfg, "swapAId"));
    const b = dash.widgets.find((w) => w.id === strConf(cfg, "swapBId"));
    if (!a || !b || a.id === b.id) return false;
    // Each widget keeps its size but takes the other's origin.
    const na = { x: b.x, y: b.y, w: a.w, h: a.h };
    const nb = { x: a.x, y: a.y, w: b.w, h: b.h };
    const inGrid = (r: typeof na) =>
      r.x >= 0 && r.y >= 0 && r.x + r.w <= dash.columns && r.y + r.h <= dash.rows;
    const others = dash.widgets.filter((w) => w.id !== a.id && w.id !== b.id);
    const valid =
      inGrid(na) &&
      inGrid(nb) &&
      !overlaps(na, nb) &&
      others.every((o) => !overlaps(o, na) && !overlaps(o, nb));
    if (!valid) return false;
    store.updateDashboard(dash.id, (cur) => ({
      ...cur,
      widgets: cur.widgets.map((w) =>
        w.id === a.id ? { ...w, ...na } : w.id === b.id ? { ...w, ...nb } : w
      ),
    }));
    return true;
  }

  function run() {
    if (editing) return;
    switch (action) {
      case "reset-list":
        return feedback(resetList());
      case "create-row":
        return feedback(createRow());
      case "swap-widgets":
        return feedback(swapWidgets());
      default:
        return feedback(false);
    }
  }

  return (
    <button
      className={`dw-button${flash ? ` flash-${flash}` : ""}${editing ? " editing" : ""}`}
      disabled={editing}
      title={editing ? "buttons fire in view mode" : label}
      onClick={run}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {flash === "ok" && <span className="dw-button-flash">✓</span>}
      {flash === "fail" && <span className="dw-button-flash fail">✗</span>}
      {appearance !== "text" && isIconName(icon) && (
        <Icon
          name={icon}
          color={(cfg.iconColor as SelectColor | undefined) ?? undefined}
          className="dw-button-icon"
        />
      )}
      {appearance !== "icon" && <span className="dw-button-label">{label}</span>}
      {status && <span className="dw-button-status">{status}</span>}
    </button>
  );
}

/* ------------------------------ config form ---------------------------- */

const ACTIONS: { value: ButtonAction; label: string; disabled?: boolean }[] = [
  { value: "none", label: "— choose action —" },
  { value: "reset-list", label: "reset a list" },
  { value: "create-row", label: "add a database row" },
  { value: "swap-widgets", label: "swap two widgets" },
  { value: "run-api", label: "run API call (soon)", disabled: true },
];

function writableProps(props: PropertyDef[]): PropertyDef[] {
  return props.filter((p) => !isComputedType(p.type));
}

function WidgetSelect({
  dash,
  value,
  onChange,
  types,
  excludeId,
}: {
  dash: Dashboard;
  value: string;
  onChange: (id: string) => void;
  /** Restrict to these widget types (absent = all). */
  types?: Widget["type"][];
  excludeId?: string;
}) {
  const options = dash.widgets.filter(
    (w) => w.id !== excludeId && (!types || types.includes(w.type))
  );
  return (
    <select
      className="dw-config-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— choose widget —</option>
      {options.map((w) => (
        <option key={w.id} value={w.id}>
          {describeWidget(w)}
        </option>
      ))}
    </select>
  );
}

export function ActionButtonConfigForm({ widget, dash, store }: WidgetProps) {
  const [iconOpen, setIconOpen] = useState(false);
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const cfg = widget.config;
  const action = (cfg.action as ButtonAction) ?? "none";
  const appearance = (cfg.appearance as Appearance) ?? "icon-text";
  const icon = strConf(cfg, "icon");
  const dbId = strConf(cfg, "databaseId");
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const defaults = Array.isArray(cfg.defaults) ? (cfg.defaults as RowDefault[]) : [];
  const defaultFor = (propId: string) => defaults.find((d) => d.propId === propId);

  function patchDefault(propId: string, value: CellValue | undefined) {
    const next = defaults.filter((d) => d.propId !== propId);
    if (value !== undefined) next.push({ propId, value });
    set({ defaults: next });
  }

  return (
    <div className="dw-config-form dw-form-config">
      <label className="dw-config-label">action</label>
      <select
        className="dw-config-select"
        value={action}
        onChange={(e) => set({ action: e.target.value })}
      >
        {ACTIONS.map((a) => (
          <option key={a.value} value={a.value} disabled={a.disabled}>
            {a.label}
          </option>
        ))}
      </select>

      {action === "reset-list" && (
        <>
          <label className="dw-config-label">target list</label>
          <WidgetSelect
            dash={dash}
            value={strConf(cfg, "targetWidgetId")}
            onChange={(id) => set({ targetWidgetId: id })}
            types={["list", "db-list"]}
          />
          <label className="dw-config-row dw-config-label">
            <span className="cell-checkbox-wrap">
              <input
                type="checkbox"
                checked={cfg.showStatus === true}
                onChange={(e) => set({ showStatus: e.target.checked })}
              />
            </span>
            live status (done/total)
          </label>
        </>
      )}

      {action === "create-row" && (
        <>
          <label className="dw-config-label">database</label>
          <DbSelect
            store={store}
            value={dbId}
            onChange={(id) => set({ databaseId: id, defaults: [] })}
          />
          {db && (
            <>
              <label className="dw-config-label">row values</label>
              {writableProps(db.properties).map((p) => {
                const d = defaultFor(p.id);
                return (
                  <div key={p.id} className="dw-form-config-row">
                    <span className="dw-form-field-name">{p.name}</span>
                    <span className="cell-checkbox-wrap">
                      <input
                        type="checkbox"
                        title="Set this property"
                        checked={d !== undefined}
                        onChange={(e) =>
                          patchDefault(p.id, e.target.checked ? null : undefined)
                        }
                      />
                    </span>
                    {d !== undefined && (
                      <div className="dw-form-default">
                        <Cell
                          dbId={db.id}
                          prop={p}
                          value={d.value ?? null}
                          store={store}
                          onChange={(v) => patchDefault(p.id, v)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}

      {action === "swap-widgets" && (
        <>
          <label className="dw-config-label">widget A</label>
          <WidgetSelect
            dash={dash}
            value={strConf(cfg, "swapAId")}
            onChange={(id) => set({ swapAId: id })}
            excludeId={widget.id}
          />
          <label className="dw-config-label">widget B</label>
          <WidgetSelect
            dash={dash}
            value={strConf(cfg, "swapBId")}
            onChange={(id) => set({ swapBId: id })}
            excludeId={widget.id}
          />
        </>
      )}

      <label className="dw-config-label">appearance</label>
      <div className="dw-config-row-btns">
        {(["icon-text", "text", "icon"] as const).map((a) => (
          <button
            key={a}
            className={`opt-btn${appearance === a ? " active" : ""}`}
            onClick={() => set({ appearance: a })}
          >
            {a}
          </button>
        ))}
      </div>
      <label className="dw-config-label">label</label>
      <input
        className="cell-input dw-config-input"
        value={strConf(cfg, "label")}
        placeholder="button"
        onChange={(e) => set({ label: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {appearance !== "text" && (
        <span className="dash-icon-wrap">
          <button className="meta-btn" onClick={() => setIconOpen((o) => !o)}>
            {isIconName(icon) ? (
              <Icon name={icon} size={12} color={cfg.iconColor as SelectColor | undefined} />
            ) : (
              "◉"
            )}{" "}
            icon
          </button>
          {iconOpen && (
            <IconPicker
              current={icon}
              currentColor={cfg.iconColor as SelectColor | undefined}
              onPick={(name) => set({ icon: name })}
              onPickColor={(iconColor) => set({ iconColor })}
              onClose={() => setIconOpen(false)}
            />
          )}
        </span>
      )}
    </div>
  );
}
