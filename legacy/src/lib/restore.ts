import type { DashboardMap, DatabaseMap, PageMap } from "../types";
import type { CortexBackup } from "./backup";
import { uploadDataUrl } from "./image";
import { isSupabaseMode } from "../storage/datasource";

/** Parse + validate a backup file's text. Throws a readable error. */
export function parseBackup(text: string): CortexBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("not a valid JSON file");
  }
  const b = data as Partial<CortexBackup>;
  if (!b || b.format !== "cortex-backup") throw new Error("not a Cortex backup file");
  if (b.version !== 1) throw new Error(`unsupported backup version: ${String(b.version)}`);
  if (typeof b.pages !== "object" || typeof b.databases !== "object" || typeof b.dashboards !== "object") {
    throw new Error("backup is missing pages, databases or dashboards");
  }
  return b as CortexBackup;
}

const DATA_IMAGE = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;

/**
 * Prepare backup data for the active data source. In Supabase mode every
 * inline `data:image/…` (in page HTML, covers, image cells, widget config —
 * anywhere in the JSON) is uploaded to Storage and replaced with its
 * `cortex-file:` ref. Identical images are uploaded once. In localStorage mode
 * the data is returned untouched.
 */
export async function prepareBackupData(
  backup: CortexBackup,
  onProgress?: (done: number, total: number) => void
): Promise<{ pages: PageMap; databases: DatabaseMap; dashboards: DashboardMap }> {
  const data = { pages: backup.pages, databases: backup.databases, dashboards: backup.dashboards };
  if (!isSupabaseMode()) return data;

  // Work on the serialized form: data URLs contain no JSON-escaped characters,
  // so a global replace over the string reaches every nested occurrence.
  let json = JSON.stringify(data);
  const unique = [...new Set(json.match(DATA_IMAGE) ?? [])];
  const refs = new Map<string, string>();
  onProgress?.(0, unique.length);
  for (let i = 0; i < unique.length; i++) {
    refs.set(unique[i], await uploadDataUrl(unique[i]));
    onProgress?.(i + 1, unique.length);
  }
  if (refs.size) json = json.replace(DATA_IMAGE, (m) => refs.get(m) ?? m);
  return JSON.parse(json);
}
