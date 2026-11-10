import { isFolder, type DashboardMap } from "./types";

/*
 * Dashboard URLs, built from names: `/home/<folder>/<slug>` or `/home/<slug>`.
 * Sibling name collisions get `-2`, `-3`… in creation order. `/` (and
 * `/home`) show the first dashboard.
 */

export function slugify(name: string | undefined): string {
  const s = (name ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "untitled";
}

function siblingSlugs(items: { id: string; name?: string; createdAt?: number }[]): Map<string, string> {
  const out = new Map<string, string>();
  const sorted = [...items].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
  const taken = new Set<string>();
  for (const n of sorted) {
    const s = slugify(n.name);
    if (!taken.has(s)) {
      taken.add(s);
      out.set(n.id, s);
    }
  }
  for (const n of sorted) {
    if (out.has(n.id)) continue;
    const s = slugify(n.name);
    let i = 2;
    while (taken.has(`${s}-${i}`)) i++;
    taken.add(`${s}-${i}`);
    out.set(n.id, `${s}-${i}`);
  }
  return out;
}

export interface DashRoutes {
  pathOf: Map<string, string>;
  byPath: Map<string, string>;
}

/** Paths relative to `/home`, e.g. `/morning` or `/work/standup`. */
export function buildDashRoutes(map: DashboardMap): DashRoutes {
  const all = Object.values(map);
  const folders = all.filter(isFolder);
  const folderSeg = siblingSlugs(folders);
  const groups = new Map<string, typeof all>();
  for (const d of all) {
    if (isFolder(d)) continue;
    const k = d.folderId ?? "";
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const pathOf = new Map<string, string>();
  const byPath = new Map<string, string>();
  for (const [folderId, items] of groups) {
    const f = folderId ? folderSeg.get(folderId) : undefined;
    for (const [id, s] of siblingSlugs(items)) {
      const path = `/${f ? `${f}/` : ""}${s}`;
      pathOf.set(id, path);
      byPath.set(path, id);
    }
  }
  return { pathOf, byPath };
}
