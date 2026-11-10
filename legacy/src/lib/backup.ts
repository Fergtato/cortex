import type { DashboardMap, DatabaseMap, PageMap } from "../types";
import type { Settings } from "../settings";
import { downloadFile } from "./download";

/**
 * Full-workspace backup: one self-contained JSON file holding every page,
 * database (incl. folders), dashboard (incl. folders) and the UI settings,
 * in the exact shapes the storage adapters persist. In localStorage mode
 * images are inlined as base64; in Supabase mode they are `cortex-file:` refs
 * to the Storage bucket (the bytes stay in Supabase). Restore: lib/restore.ts.
 *
 * Deliberately excluded: the data-source config and API connections (their
 * secrets live server-side only).
 */
export interface CortexBackup {
  format: "cortex-backup";
  version: 1;
  exportedAt: string;
  pages: PageMap;
  databases: DatabaseMap;
  dashboards: DashboardMap;
  settings: Settings;
}

export function buildBackup(
  data: { pages: PageMap; databases: DatabaseMap; dashboards: DashboardMap },
  settings: Settings
): CortexBackup {
  return {
    format: "cortex-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    ...data,
    settings,
  };
}

export function downloadBackup(backup: CortexBackup) {
  const stamp = backup.exportedAt.slice(0, 19).replace(/[T:]/g, "-");
  downloadFile(
    `cortex-backup-${stamp}.json`,
    JSON.stringify(backup, null, 2),
    "application/json"
  );
}
