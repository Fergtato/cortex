import type { ComponentType, ReactNode } from "react";
import type { IconName } from "@cortex/ui";

/** Props every module view receives from the shell. */
export interface ModuleViewProps {
  /** The part of the URL after `/<module id>`, always starting with `/` (just `/` at the module root). */
  subpath: string;
}

/** One widget placed on a dashboard: grid position, size and its own config. */
export interface WidgetInstance {
  id: string;
  type: string;
  /** Top-left grid cell (0-based column/row) and span in cells. */
  x: number;
  y: number;
  w: number;
  h: number;
  config: Record<string, unknown>;
}

/**
 * What a widget may do to the dashboard it sits on. Most widgets only patch
 * their own config; the action button also targets other widgets.
 */
export interface DashboardHandle {
  id: string;
  columns: number;
  rows: number;
  widgets: WidgetInstance[];
  /** Merges `patch` into one widget's config. */
  patchWidget: (widgetId: string, patch: Record<string, unknown>) => void;
  /** Replaces the widget list (layout changes such as swapping two widgets). */
  setWidgets: (fn: (widgets: WidgetInstance[]) => WidgetInstance[]) => void;
}

/** Props a widget (and its config form) receives from the dashboard grid. */
export interface WidgetProps {
  widget: WidgetInstance;
  dash: DashboardHandle;
  /** True while the dashboard is in edit mode. */
  editing: boolean;
}

/**
 * A module's contribution to Home dashboards. New types are namespaced by
 * module (`finance.balance`); widgets ported from Cortex v0 keep their v0
 * type ids (`text`, `db-view`…) so imported dashboards still resolve.
 * Heavy widgets should pass `React.lazy` components; the grid wraps every
 * widget in Suspense.
 */
export interface WidgetDef {
  type: string;
  label: string;
  icon: IconName;
  /** Optional short glyph shown in the picker instead of the icon. */
  glyph?: string;
  defaultSize: { w: number; h: number };
  defaultConfig: Record<string, unknown>;
  Component: ComponentType<WidgetProps>;
  ConfigForm?: ComponentType<WidgetProps>;
  /** Still renders on existing dashboards but isn't offered in the picker. */
  hidden?: boolean;
}

/** Reads a string from a loosely typed widget config. */
export function strConf(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}

/**
 * How a module takes part in Settings → Backup. One backup file holds every
 * module's data under `modules.<id>`; Cortex v0 files are read via `fromV0`.
 */
export interface ModuleBackup {
  /** Called inside the module's Provider, from the Backup page. */
  useBackup: () => {
    ready: boolean;
    /** What the module holds now, e.g. "12 pages · 3 databases". */
    summary: string;
    exportData: () => unknown;
    importData: (data: unknown, mode: "merge" | "replace") => void;
  };
  /** This module's data from a Cortex v0 (version 1) backup, if it has any. */
  fromV0?: (raw: Record<string, unknown>) => unknown | undefined;
  /** Short description of data from a file, for the import preview. */
  describe: (data: unknown) => string;
}

/**
 * The web half of a Cortex module. The shell reads the registry of these to
 * build the app rail, route `/<id>/…` to `Page`, and fill the widget picker.
 * Adding an app = a folder under `modules/` + one line in the registry.
 */
export interface CortexModule {
  /** URL segment and storage namespace. Lowercase, stable forever. */
  id: string;
  name: string;
  icon: IconName;
  /** Optional section sidebar. Modules without one get the full canvas width. */
  Sidebar?: ComponentType<ModuleViewProps>;
  /** The module's page; it handles its own sub-routes from `subpath`. */
  Page: ComponentType<ModuleViewProps>;
  /** Widgets this module offers on Home dashboards. */
  widgets?: WidgetDef[];
  /** Data this module contributes to Settings → Backup. */
  backup?: ModuleBackup;
  /**
   * Wraps the whole signed-in app (not just this module's page), so module
   * state such as a loaded store survives switching apps and other modules'
   * widgets can read it. Keep it cheap: it mounts even if the module is off.
   */
  Provider?: ComponentType<{ children: ReactNode }>;
  /** Sections this module adds to Settings, at `/settings/<module id>/<section id>`. */
  settings?: ModuleSettingsSection[];
  /** Hidden modules are registered but not on the rail (e.g. still being built). */
  hidden?: boolean;
}

export interface ModuleSettingsSection {
  id: string;
  label: string;
  icon: IconName;
  Component: ComponentType;
}
