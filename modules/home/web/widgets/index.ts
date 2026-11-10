import type { WidgetDef } from "@cortex/core";
import { ApiMetricConfigForm, ApiMetricWidget } from "./ApiMetricWidget";
import { ApiPanelConfigForm, ApiPanelWidget } from "./ApiPanelWidget";
import { ClockConfigForm, ClockWidget } from "./ClockWidget";
import { ImageConfigForm, ImageWidget } from "./ImageWidget";
import { ScifiConfigForm, ScifiWidget } from "./ScifiWidget";
import { TextConfigForm, TextWidget } from "./TextWidget";
import { DEFAULT_PRESETS, TimerConfigForm, TimerWidget } from "./TimerWidget";

/** Widgets Home itself offers (Notes and other modules contribute their own). Type ids match v0. */
export const HOME_WIDGETS: WidgetDef[] = [
  {
    type: "text",
    label: "Text",
    icon: "note",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { text: "", align: "left", valign: "top", size: "m", color: null },
    Component: TextWidget,
    ConfigForm: TextConfigForm,
  },
  {
    type: "clock",
    label: "Clock",
    icon: "clock",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { h24: true, seconds: true, date: true },
    Component: ClockWidget,
    ConfigForm: ClockConfigForm,
  },
  {
    type: "timer",
    label: "Timer",
    icon: "bell",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { presets: DEFAULT_PRESETS },
    Component: TimerWidget,
    ConfigForm: TimerConfigForm,
  },
  {
    type: "image",
    label: "Image",
    icon: "grid",
    defaultSize: { w: 3, h: 3 },
    defaultConfig: { src: null, fit: "fill" },
    Component: ImageWidget,
    ConfigForm: ImageConfigForm,
  },
  {
    type: "api-metric",
    label: "API metric",
    icon: "bolt",
    defaultSize: { w: 3, h: 2 },
    defaultConfig: { connectionId: "", path: "", valuePath: "", label: "", suffix: "", refreshSec: 60 },
    Component: ApiMetricWidget,
    ConfigForm: ApiMetricConfigForm,
  },
  {
    type: "api-panel",
    label: "API panel",
    icon: "list",
    defaultSize: { w: 4, h: 3 },
    defaultConfig: { connectionId: "", path: "", itemsPath: "", labelPath: "", statusPath: "", okValue: "", label: "", refreshSec: 30 },
    Component: ApiPanelWidget,
    ConfigForm: ApiPanelConfigForm,
  },
  {
    type: "scifi",
    label: "Sci-fi",
    icon: "pulse",
    defaultSize: { w: 4, h: 2 },
    defaultConfig: { mode: "telemetry", label: "TELEMETRY" },
    Component: ScifiWidget,
    ConfigForm: ScifiConfigForm,
  },
];
