import type { ComponentType } from "react";
import type { Dashboard, Widget, WidgetType } from "../../../types";
import type { Store } from "../../../store";
import { TextWidget, TextConfigForm } from "./TextWidget";
import { ClockWidget, ClockConfigForm } from "./ClockWidget";
import { TimerWidget, TimerConfigForm, DEFAULT_PRESETS } from "./TimerWidget";
import { ImageWidget, ImageConfigForm } from "./ImageWidget";
import { ListWidget, ListConfigForm } from "./ListWidget";
import { ScifiWidget, ScifiConfigForm } from "./ScifiWidget";
import { DbViewWidget, DbViewConfigForm } from "./DbViewWidget";
import { MetricWidget, MetricConfigForm } from "./MetricWidget";
import { HabitWidget, HabitConfigForm } from "./HabitWidget";
import { ChartWidget, ChartConfigForm } from "./ChartWidget";
import { FormWidget, FormConfigForm } from "./FormWidget";
import { ActionButtonWidget, ActionButtonConfigForm } from "./ActionButtonWidget";
import { ApiMetricWidget, ApiMetricConfigForm } from "./ApiMetricWidget";
import { ApiPanelWidget, ApiPanelConfigForm } from "./ApiPanelWidget";

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
  /** Legacy types still render but are left out of the widget picker. */
  hidden?: boolean;
}

export const WIDGET_DEFS: Record<WidgetType, WidgetDef> = {
  text: {
    type: "text",
    label: "text",
    glyph: "¶",
    defaultSize: { w: 2, h: 2 },
    defaultConfig: { text: "", align: "left", valign: "top", size: "m", color: null },
    Component: TextWidget,
    ConfigForm: TextConfigForm,
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
    defaultConfig: {
      source: "basic",
      title: "",
      items: [],
      databaseId: "",
      viewId: "",
      checkPropId: "",
    },
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
  // Legacy: merged into "list" (source: database); old widgets still render.
  "db-list": {
    type: "db-list",
    label: "list",
    glyph: "☑",
    defaultSize: { w: 2, h: 3 },
    defaultConfig: { databaseId: "", viewId: "", checkPropId: "" },
    Component: ListWidget,
    ConfigForm: ListConfigForm,
    hidden: true,
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
  button: {
    type: "button",
    label: "action button",
    glyph: "◉",
    defaultSize: { w: 1, h: 1 },
    defaultConfig: {
      label: "button",
      icon: "",
      appearance: "icon-text",
      action: "none",
      targetWidgetId: "",
      showStatus: false,
      databaseId: "",
      defaults: [],
      swapAId: "",
      swapBId: "",
    },
    Component: ActionButtonWidget,
    ConfigForm: ActionButtonConfigForm,
  },
  "api-metric": {
    type: "api-metric",
    label: "API metric",
    glyph: "↯",
    defaultSize: { w: 2, h: 1 },
    defaultConfig: {
      connectionId: "",
      path: "",
      valuePath: "",
      label: "",
      suffix: "",
      refreshSec: 60,
    },
    Component: ApiMetricWidget,
    ConfigForm: ApiMetricConfigForm,
  },
  "api-panel": {
    type: "api-panel",
    label: "API panel",
    glyph: "☍",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: {
      connectionId: "",
      path: "",
      itemsPath: "",
      labelPath: "",
      statusPath: "",
      okValue: "",
      label: "",
      refreshSec: 30,
    },
    Component: ApiPanelWidget,
    ConfigForm: ApiPanelConfigForm,
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
