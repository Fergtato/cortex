import type { ComponentType } from "react";
import type { Dashboard, Widget, WidgetType } from "../../../types";
import type { Store } from "../../../store";
import { TextWidget } from "./TextWidget";
import { ClockWidget, ClockConfigForm } from "./ClockWidget";

/** Props every widget component receives from the grid. */
export interface WidgetProps {
  widget: Widget;
  dash: Dashboard;
  store: Store;
  /** True while the dashboard is in edit mode. */
  editing: boolean;
}

/**
 * Registry entry for one widget type. The grid and picker only ever consult
 * this table — adding a widget type means adding an entry here, nothing else.
 */
export interface WidgetDef {
  type: WidgetType;
  label: string;
  /** TUI glyph shown in the widget picker and frame header. */
  glyph: string;
  defaultSize: { w: number; h: number };
  defaultConfig: Record<string, unknown>;
  Component: ComponentType<WidgetProps>;
  /** Optional settings form shown from the frame's ⚙ button in edit mode. */
  ConfigForm?: ComponentType<WidgetProps>;
}

export const WIDGET_DEFS: Record<WidgetType, WidgetDef> = {
  text: {
    type: "text",
    label: "text",
    glyph: "¶",
    defaultSize: { w: 2, h: 2 },
    defaultConfig: { text: "" },
    Component: TextWidget,
  },
  clock: {
    type: "clock",
    label: "clock",
    glyph: "◷",
    defaultSize: { w: 2, h: 1 },
    defaultConfig: { h24: true, seconds: true, date: true },
    Component: ClockWidget,
    ConfigForm: ClockConfigForm,
  },
};

export const WIDGET_TYPES = Object.keys(WIDGET_DEFS) as WidgetType[];

/** Patch one widget's config immutably through the store. */
export function patchWidgetConfig(
  store: Store,
  dashId: string,
  widgetId: string,
  patch: Record<string, unknown>
) {
  store.updateDashboard(dashId, (d) => ({
    ...d,
    widgets: d.widgets.map((w) =>
      w.id === widgetId ? { ...w, config: { ...w.config, ...patch } } : w
    ),
  }));
}
