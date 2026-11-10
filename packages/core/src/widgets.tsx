import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { WidgetDef } from "./module";

/*
 * Every module's widgets, keyed by type. The shell fills this from the module
 * registry; Home's grid and widget picker read it. A dashboard holding a type
 * whose module isn't installed shows a placeholder instead of breaking.
 */
const WidgetRegistry = createContext<Record<string, WidgetDef>>({});

export function WidgetRegistryProvider({ defs, children }: { defs: WidgetDef[]; children: ReactNode }) {
  const map = useMemo(() => Object.fromEntries(defs.map((d) => [d.type, d])), [defs]);
  return <WidgetRegistry.Provider value={map}>{children}</WidgetRegistry.Provider>;
}

export function useWidgetDefs(): Record<string, WidgetDef> {
  return useContext(WidgetRegistry);
}
