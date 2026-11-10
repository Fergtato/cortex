import { Suspense, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { DashboardHandle, WidgetDef } from "@cortex/core";
import { Icon } from "@cortex/ui";
import type { Widget } from "../types";

interface Props {
  widget: Widget;
  /** Undefined when the widget's module isn't installed. */
  def: WidgetDef | undefined;
  dash: DashboardHandle;
  editing: boolean;
  /** True while this widget is being moved/resized (renders dimmed). */
  dragging: boolean;
  style: CSSProperties;
  onMoveStart: (e: ReactPointerEvent) => void;
  onResizeStart: (e: ReactPointerEvent, edges: { e: boolean; s: boolean }) => void;
  onRemove: () => void;
}

/**
 * Chrome around every widget: a panel, and in edit mode a drag header,
 * settings (when the widget has a ConfigForm), remove, and resize handles.
 * Widgets may be lazy components, so the body sits in Suspense.
 */
export function WidgetFrame({ widget, def, dash, editing, dragging, style, onMoveStart, onResizeStart, onRemove }: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const Component = def?.Component;
  const ConfigForm = def?.ConfigForm;

  return (
    <div className={`dash-widget${editing ? " editing" : ""}${dragging ? " dragging" : ""}${editing && configOpen ? " config-open" : ""}`} style={style}>
      {editing && (
        <div className="dash-widget-head" onPointerDown={onMoveStart} title="Drag to move">
          {def?.glyph ? <span className="dash-widget-glyph">{def.glyph}</span> : <Icon name={def?.icon ?? "grid"} size={14} />}
          <span className="dash-widget-label">{def?.label ?? widget.type}</span>
          <span className="dash-widget-head-actions" onPointerDown={(e) => e.stopPropagation()}>
            {ConfigForm && (
              <button className="dash-widget-btn" title="Widget settings" aria-label="Widget settings" onClick={() => setConfigOpen((o) => !o)}>
                <Icon name="sliders" size={14} />
              </button>
            )}
            <button className="dash-widget-btn" title="Remove widget" aria-label="Remove widget" onClick={onRemove}>
              <Icon name="x" size={14} />
            </button>
          </span>
        </div>
      )}
      {editing && configOpen && ConfigForm && (
        <>
          <div className="dash-backdrop" onClick={() => setConfigOpen(false)} />
          <div className="dash-widget-config" onPointerDown={(e) => e.stopPropagation()}>
            <Suspense fallback={null}>
              <ConfigForm widget={widget} dash={dash} editing={editing} />
            </Suspense>
          </div>
        </>
      )}
      <div className="dash-widget-body">
        {Component ? (
          <Suspense fallback={<div className="dash-widget-loading" />}>
            <Component widget={widget} dash={dash} editing={editing} />
          </Suspense>
        ) : (
          <div className="dash-widget-missing">
            <span className="cx-label">Unavailable</span>
            <span>This widget's app isn't installed ({widget.type}).</span>
          </div>
        )}
      </div>
      {editing && (
        <>
          <div className="dash-rs dash-rs-e" onPointerDown={(e) => onResizeStart(e, { e: true, s: false })} />
          <div className="dash-rs dash-rs-s" onPointerDown={(e) => onResizeStart(e, { e: false, s: true })} />
          <div className="dash-rs dash-rs-se" onPointerDown={(e) => onResizeStart(e, { e: true, s: true })} />
        </>
      )}
    </div>
  );
}
