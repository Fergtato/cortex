import { FILE_REF_PREFIX, uploadFile } from "@cortex/core";
import type { DatabaseMap, PageMap } from "../types";
import type { NotesData } from "../store";
import { downloadFile } from "./download";

/*
 * Notes backups.
 *
 * v2 file: { format: "cortex-backup", version: 2, exportedAt, modules: { notes: { pages, databases } } }
 *   Other modules add their own key under `modules` (Home's dashboards in Phase 3).
 * v1 file (Cortex v0): { format: "cortex-backup", version: 1, pages, databases, dashboards, settings }
 *   Only pages and databases are read here; dashboards come across with Home.
 *
 * Images inside a backup can be:
 *  - `data:image/...` URLs (v0 in localStorage mode): uploaded to this server.
 *  - `cortex-file:<id>` refs from this server: kept as they are.
 *  - `cortex-file:<uid>/<name>` refs into a v0 Supabase bucket: copied across
 *    if the person signs in to that Supabase, otherwise left (and reported).
 */

export interface ParsedBackup {
  version: 1 | 2;
  exportedAt?: string;
  data: NotesData;
  /** Dashboards present in a v0 file (not imported yet; Home brings them in). */
  dashboardCount: number;
}

export function buildBackup(data: NotesData) {
  return {
    format: "cortex-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    modules: { notes: { pages: data.pages, databases: data.databases } },
  };
}

export function downloadBackup(data: NotesData) {
  const b = buildBackup(data);
  const stamp = b.exportedAt.slice(0, 19).replace(/[T:]/g, "-");
  downloadFile(`cortex-notes-${stamp}.json`, JSON.stringify(b, null, 2), "application/json");
}

/** Parses a v1 (Cortex v0) or v2 backup. Throws a readable error. */
export function parseBackup(text: string): ParsedBackup {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("This isn't a valid JSON file.");
  }
  if (!raw || raw.format !== "cortex-backup") throw new Error("This isn't a Cortex backup file.");
  const asMaps = (pages: unknown, databases: unknown): NotesData => {
    if (typeof pages !== "object" || !pages || typeof databases !== "object" || !databases) {
      throw new Error("The backup has no pages or databases.");
    }
    return { pages: pages as PageMap, databases: databases as DatabaseMap };
  };
  if (raw.version === 1) {
    return {
      version: 1,
      exportedAt: raw.exportedAt,
      data: asMaps(raw.pages, raw.databases),
      dashboardCount: Object.values(raw.dashboards ?? {}).filter((d: any) => d?.kind !== "folder").length,
    };
  }
  if (raw.version === 2) {
    const notes = raw.modules?.notes;
    if (!notes) throw new Error("The backup has no Notes data.");
    return { version: 2, exportedAt: raw.exportedAt, data: asMaps(notes.pages, notes.databases), dashboardCount: 0 };
  }
  throw new Error(`Unsupported backup version: ${String(raw.version)}.`);
}

const DATA_IMAGE = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
// v0 Supabase refs are `<uid>/<file>`; this server's ids never contain a slash.
const SUPABASE_REF = /cortex-file:([0-9a-f-]{36}\/[A-Za-z0-9._-]+)/gi;

/** Counts what an import will have to upload or copy. */
export function scanImages(data: NotesData): { inline: number; supabase: string[] } {
  const json = JSON.stringify(data);
  const inline = new Set(json.match(DATA_IMAGE) ?? []).size;
  const supabase = [...new Set([...json.matchAll(SUPABASE_REF)].map((m) => m[1]))];
  return { inline, supabase };
}

export interface SupabaseSource {
  url: string;
  anonKey: string;
  email: string;
  password: string;
}

async function supabaseToken(src: SupabaseSource): Promise<string> {
  const res = await fetch(`${src.url.replace(/\/+$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: src.anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: src.email, password: src.password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`Couldn't sign in to Supabase: ${body.error_description ?? body.msg ?? res.statusText}`);
  }
  return body.access_token as string;
}

/**
 * Rewrites a backup's images for this server: uploads inline images and,
 * when `supabase` is given, copies v0 Storage images. Identical images are
 * uploaded once. Returns the rewritten data and the refs it couldn't copy.
 */
export async function prepareImport(
  data: NotesData,
  supabase: SupabaseSource | null,
  onProgress: (done: number, total: number) => void,
): Promise<{ data: NotesData; failed: string[] }> {
  let json = JSON.stringify(data);
  const inline = [...new Set(json.match(DATA_IMAGE) ?? [])];
  const remote = supabase ? [...new Set([...json.matchAll(SUPABASE_REF)].map((m) => m[1]))] : [];
  const total = inline.length + remote.length;
  let done = 0;
  onProgress(0, total);

  const replacements = new Map<string, string>();
  const failed: string[] = [];

  for (const dataUrl of inline) {
    const blob = await (await fetch(dataUrl)).blob();
    replacements.set(dataUrl, await uploadFile(blob, `image.${blob.type.split("/")[1] ?? "png"}`));
    onProgress(++done, total);
  }

  if (supabase && remote.length) {
    const token = await supabaseToken(supabase);
    const base = supabase.url.replace(/\/+$/, "");
    for (const path of remote) {
      try {
        const res = await fetch(`${base}/storage/v1/object/authenticated/cortex-files/${path}`, {
          headers: { apikey: supabase.anonKey, authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(res.statusText);
        const blob = await res.blob();
        replacements.set(FILE_REF_PREFIX + path, await uploadFile(blob, path.split("/").pop() ?? "image"));
      } catch {
        failed.push(path);
      }
      onProgress(++done, total);
    }
  }

  if (replacements.size) {
    // Data URLs and refs contain no JSON-escaped characters, so a replace over
    // the serialised form reaches every nested occurrence (HTML, cells, covers).
    json = json.replace(DATA_IMAGE, (m) => replacements.get(m) ?? m);
    json = json.replace(SUPABASE_REF, (m) => replacements.get(m) ?? m);
  }
  return { data: JSON.parse(json), failed };
}
