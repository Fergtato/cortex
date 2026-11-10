import { useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { Dashboard, Widget } from "../../types";
import type { Store } from "../../store";
import type { WidgetDef } from "./widgets/registry";

interface Props {
  widget: Widget;
  def: WidgetDef;
  dash: Dashboard;
  store: Store;
  editing: boolean;
  /** True while this widget is being moved/resized (renders dimmed). */
  dragging: boolean;
  style: CSSProperties;
  onMoveStart: (e: ReactPointerEvent) => void;
  onResizeStart: (e: ReactPointerEvent, edges: { e: boolean; s: boolean }) => void;
  onRemove: () => void;
}

/**
 * Chrome around every widget: 1px border, and in edit mode a drag header,
 * settings (when the widget has a ConfigForm), remove, and resize handles.
 */
export function WidgetFrame({
  widget,
  def,
  dash,
  store,
  editing,
  dragging,
  style,
  onMoveStart,
  onResizeStart,
  onRemove,
}: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const { Component, ConfigForm } = def;

  return (
    <div
      className={`dash-widget${editing ? " editing" : ""}${dragging ? " dragging" : ""}`}
      style={style}
    >
      {editing && (
        <div className="dash-widget-head" onPointerDown={onMoveStart} title="drag to move">
          <span className="dash-widget-glyph">{def.glyph}</span>
          <span className="dash-widget-label">{def.label}</span>
          <span className="dash-widget-head-actions" onPointerDown={(e) => e.stopPropagation()}>
            {ConfigForm && (
              <button
                className="row-btn"
                title="Widget settings"
                onClick={() => setConfigOpen((o) => !o)}
              >
                ⚙
              </button>
            )}
            <button className="row-btn" title="Remove widget" onClick={onRemove}>
              ×
            </button>
          </span>
        </div>
      )}
      {editing && configOpen && ConfigForm && (
        <>
          <div className="tree-menu-backdrop" onClick={() => setConfigOpen(false)} />
          <div className="dash-widget-config" onPointerDown={(e) => e.stopPropagation()}>
            <ConfigForm widget={widget} dash={dash} store={store} editing={editing} />
          </div>
        </>
      )}
      <div className="dash-widget-body">
        <Component widget={widget} dash={dash} store={store} editing={editing} />
      </div>
      {editing && (
        <>
          <div
            className="dash-rs dash-rs-e"
            onPointerDown={(e) => onResizeStart(e, { e: true, s: false })}
          />
          <div
            className="dash-rs dash-rs-s"
            onPointerDown={(e) => onResizeStart(e, { e: false, s: true })}
          />
          <div
            className="dash-rs dash-rs-se"
            onPointerDown={(e) => onResizeStart(e, { e: true, s: true })}
          />
        </>
      )}
    </div>
  );
}
