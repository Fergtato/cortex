import { lazy, type ComponentType } from "react";
import type { WidgetDef, WidgetProps } from "@cortex/core";

/*
 * Widgets Notes contributes to Home. Components are lazy: they pull in the
 * database views and Notes styles, which a dashboard without Notes widgets
 * never needs. Type ids match Cortex v0 so imported dashboards resolve.
 */
type Loaded = typeof import("./load");
const chunk = () => import("./load");
const L = (name: keyof Loaded) =>
  lazy(() => chunk().then((m) => ({ default: m[name] as ComponentType<WidgetProps> })));

export const NOTES_WIDGETS: WidgetDef[] = [
  {
    type: "db-view",
    label: "Database view",
    icon: "grid",
    defaultSize: { w: 6, h: 4 },
    defaultConfig: { databaseId: "", viewId: "" },
    Component: L("DbViewWidget"),
    ConfigForm: L("DbViewConfigForm"),
  },
  {
    type: "list",
    label: "List",
    icon: "check",
    defaultSize: { w: 3, h: 4 },
    defaultConfig: { source: "basic", title: "", items: [], databaseId: "", viewId: "", checkPropId: "" },
    Component: L("ListWidget"),
    ConfigForm: L("ListConfigForm"),
  },
  // v0 legacy: merged into "list" (source: database); existing widgets still render.
  {
    type: "db-list",
    label: "List",
    icon: "check",
    defaultSize: { w: 3, h: 4 },
    defaultConfig: { databaseId: "", viewId: "", checkPropId: "" },
    Component: L("ListWidget"),
    ConfigForm: L("ListConfigForm"),
    hidden: true,
  },
  {
    type: "metric",
    label: "Metric",
    icon: "arrow-up",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { databaseId: "", viewId: "", propId: "", op: "count", label: "" },
    Component: L("MetricWidget"),
    ConfigForm: L("MetricConfigForm"),
  },
  {
    type: "habit",
    label: "Habit tracker",
    icon: "calendar",
    defaultSize: { w: 4, h: 3 },
    defaultConfig: { databaseId: "", datePropId: "", viewId: "", weeks: 16, label: "" },
    Component: L("HabitWidget"),
    ConfigForm: L("HabitConfigForm"),
  },
  {
    type: "chart",
    label: "Chart",
    icon: "arrow-up-right",
    defaultSize: { w: 6, h: 3 },
    defaultConfig: { databaseId: "", viewId: "", kind: "bar", xPropId: "", yPropId: "", yAgg: "sum", seriesPropId: "", label: "" },
    Component: L("ChartWidget"),
    ConfigForm: L("ChartConfigForm"),
  },
  {
    type: "form",
    label: "Form",
    icon: "inbox",
    defaultSize: { w: 3, h: 4 },
    defaultConfig: { databaseId: "", fields: [], title: "", submitLabel: "" },
    Component: L("FormWidget"),
    ConfigForm: L("FormConfigForm"),
  },
  {
    type: "button",
    label: "Action button",
    icon: "plus",
    defaultSize: { w: 2, h: 1 },
    defaultConfig: {
      label: "Button",
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
    Component: L("ActionButtonWidget"),
    ConfigForm: L("ActionButtonConfigForm"),
  },
];
