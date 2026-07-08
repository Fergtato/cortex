import type { ComponentType } from "react";
import type { Dashboard, Widget, WidgetType } from "../../../types";
import type { Store } from "../../../store";
import { TextWidget } from "./TextWidget";
import { ClockWidget, ClockConfigForm } from "./ClockWidget";
import { TimerWidget, TimerConfigForm, DEFAULT_PRESETS } from "./TimerWidget";
import { ImageWidget, ImageConfigForm } from "./ImageWidget";
import { ListWidget, ListConfigForm } from "./ListWidget";
import { ScifiWidget, ScifiConfigForm } from "./ScifiWidget";
import { DbViewWidget, DbViewConfigForm } from "./DbViewWidget";
import { DbListWidget, DbListConfigForm } from "./DbListWidget";
import { MetricWidget, MetricConfigForm } from "./MetricWidget";
import { HabitWidget, HabitConfigForm } from "./HabitWidget";
import { ChartWidget, ChartConfigForm } from "./ChartWidget";
import { FormWidget, FormConfigForm } from "./FormWidget";

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
  timer: {
    type: "timer",
    label: "timer",
    glyph: "◔",
    defaultSize: { w: 2, h: 2 },
    defaultConfig: { presets: DEFAULT_PRESETS },
    Component: TimerWidget,
    ConfigForm: TimerConfigForm,
  },
  image: {
    type: "image",
    label: "image",
    glyph: "▣",
    defaultSize: { w: 2, h: 2 },
    defaultConfig: { src: null, fit: "fill" },
    Component: ImageWidget,
    ConfigForm: ImageConfigForm,
  },
  list: {
    type: "list",
    label: "list",
    glyph: "☑",
    defaultSize: { w: 2, h: 3 },
    defaultConfig: { title: "", items: [] },
    Component: ListWidget,
    ConfigForm: ListConfigForm,
  },
  scifi: {
    type: "scifi",
    label: "sci-fi",
    glyph: "⌁",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { mode: "telemetry", label: "TELEMETRY" },
    Component: ScifiWidget,
    ConfigForm: ScifiConfigForm,
  },
  "db-view": {
    type: "db-view",
    label: "database view",
    glyph: "▦",
    defaultSize: { w: 4, h: 3 },
    defaultConfig: { databaseId: "", viewId: "" },
    Component: DbViewWidget,
    ConfigForm: DbViewConfigForm,
  },
  "db-list": {
    type: "db-list",
    label: "database list",
    glyph: "☷",
    defaultSize: { w: 2, h: 3 },
    defaultConfig: { databaseId: "", viewId: "", checkPropId: "" },
    Component: DbListWidget,
    ConfigForm: DbListConfigForm,
  },
  metric: {
    type: "metric",
    label: "metric",
    glyph: "Σ",
    defaultSize: { w: 2, h: 1 },
    defaultConfig: { databaseId: "", viewId: "", propId: "", op: "count", label: "" },
    Component: MetricWidget,
    ConfigForm: MetricConfigForm,
  },
  habit: {
    type: "habit",
    label: "habit tracker",
    glyph: "▩",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { databaseId: "", datePropId: "", viewId: "", weeks: 16, label: "" },
    Component: HabitWidget,
    ConfigForm: HabitConfigForm,
  },
  chart: {
    type: "chart",
    label: "chart",
    glyph: "▨",
    defaultSize: { w: 4, h: 2 },
    defaultConfig: {
      databaseId: "",
      viewId: "",
      kind: "bar",
      xPropId: "",
      yPropId: "",
      yAgg: "sum",
      seriesPropId: "",
      label: "",
    },
    Component: ChartWidget,
    ConfigForm: ChartConfigForm,
  },
  form: {
    type: "form",
    label: "form",
    glyph: "⌨",
    defaultSize: { w: 2, h: 3 },
    defaultConfig: { databaseId: "", fields: [], title: "", submitLabel: "" },
    Component: FormWidget,
    ConfigForm: FormConfigForm,
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
