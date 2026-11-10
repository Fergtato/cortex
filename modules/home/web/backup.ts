import { useContext } from "react";
import type { ModuleBackup } from "@cortex/core";
import { isDashboard, type DashboardMap } from "./types";
import { DashContext } from "./context";

const count = (m: DashboardMap | undefined) => Object.values(m ?? {}).filter(isDashboard).length;

/** Home in Settings → Backup: dashboards (with folders). */
export const homeBackup: ModuleBackup = {
  useBackup: () => {
    const store = useContext(DashContext)!;
    return {
      ready: store.loaded,
      summary: `${count(store.map)} dashboards`,
      exportData: () => ({ dashboards: store.map }),
      importData: (data, mode) => {
        const d = (data as { dashboards?: DashboardMap }).dashboards ?? {};
        store.replaceAll(mode === "replace" ? d : { ...store.map, ...d });
      },
    };
  },
  fromV0: (raw) => (raw.dashboards ? { dashboards: raw.dashboards as DashboardMap } : undefined),
  describe: (data) => `${count((data as { dashboards?: DashboardMap })?.dashboards)} dashboards`,
};
