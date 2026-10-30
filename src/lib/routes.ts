import type { DashboardMap, DatabaseMap, PageMap } from "../types";

/**
 * URL routing. Every page, database and dashboard gets a readable, bookmarkable
 * path: its ancestors (parent pages / containing folder) as slugs, then its own
 * slug with the id appended — e.g. `/page/projects/cortex/roadmap-k3j9x2`.
 * Only the trailing id is authoritative, so renames and moves never break an
 * old link; the slugs are just for humans and get rewritten in place.
 */
export type Selection =
  | { kind: "page"; id: string }
  | { kind: "database"; id: string }
  | { kind: "dashboard"; id: string }
  | null;

interface RouteData {
  pages: PageMap;
  databases: DatabaseMap;
  dashboards: DashboardMap;
}

const PREFIX = { page: "page", database: "database", dashboard: "dashboard" } as const;

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

function folderSlug(map: Record<string, { name?: string }>, folderId?: string | null) {
  const folder = folderId ? map[folderId] : undefined;
  return folder ? [slugify(folder.name)] : [];
}

export function buildPath(sel: Selection, data: RouteData): string {
  if (!sel) return "/";
  let segs: string[] = [];
  let leaf: string | undefined;
  if (sel.kind === "page") {
    const page = data.pages[sel.id];
    if (!page) return "/";
    leaf = page.title;
    // Ancestors, root first (cycle-guarded).
    const seen = new Set([page.id]);
    let cur = page.parentId ? data.pages[page.parentId] : undefined;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      segs.unshift(slugify(cur.title));
      cur = cur.parentId ? data.pages[cur.parentId] : undefined;
    }
  } else {
    const map = sel.kind === "database" ? data.databases : data.dashboards;
    const item = map[sel.id] as { name?: string; folderId?: string | null } | undefined;
    if (!item) return "/";
    leaf = item.name;
    segs = folderSlug(map, item.folderId);
  }
  return `/${[PREFIX[sel.kind], ...segs, `${slugify(leaf)}-${sel.id}`].join("/")}`;
}

export function parsePath(pathname: string, data: RouteData): Selection {
  const segs = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (segs.length < 2) return null;
  const kind = (Object.keys(PREFIX) as (keyof typeof PREFIX)[]).find(
    (k) => PREFIX[k] === segs[0]
  );
  if (!kind) return null;
  const last = segs[segs.length - 1];
  const map = (
    kind === "page" ? data.pages : kind === "database" ? data.databases : data.dashboards
  ) as Record<string, { kind?: string }>;
  // Match the id suffix rather than splitting on "-", so ids that themselves
  // contain dashes (e.g. imported ones) still resolve. Folders are skipped.
  const id = Object.keys(map).find(
    (k) => (last === k || last.endsWith(`-${k}`)) && map[k]?.kind !== "folder"
  );
  return id ? { kind, id } : null;
}

/** Display name for the browser tab title. */
export function selectionTitle(sel: Selection, data: RouteData): string | null {
  if (!sel) return null;
  if (sel.kind === "page") return data.pages[sel.id]?.title || "untitled";
  const map = sel.kind === "database" ? data.databases : data.dashboards;
  const item = map[sel.id] as { name?: string } | undefined;
  return item ? item.name || "untitled" : null;
}
