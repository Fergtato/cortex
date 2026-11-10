import type { ComponentType, ReactNode } from "react";
import type { IconName } from "@cortex/ui";

/** Props every module view receives from the shell. */
export interface ModuleViewProps {
  /** The part of the URL after `/<module id>`, always starting with `/` (just `/` at the module root). */
  subpath: string;
}

/** Props a Home widget receives from the dashboard grid. */
export interface WidgetProps<C = Record<string, unknown>> {
  config: C;
  /** True while the dashboard is in edit mode. */
  editing: boolean;
  setConfig: (next: C) => void;
}

/**
 * A module's contribution to Home. `type` is namespaced by module
 * (`finance.balance`) so two modules can never collide.
 */
export interface WidgetDef<C = Record<string, unknown>> {
  type: string;
  label: string;
  icon: IconName;
  defaultSize: { w: number; h: number };
  defaultConfig: C;
  Component: ComponentType<WidgetProps<C>>;
  ConfigForm?: ComponentType<WidgetProps<C>>;
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
  widgets?: WidgetDef<any>[];
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
