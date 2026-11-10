import type { DatabaseMap, PageMap } from "../types";

/**
 * URL routing inside the Notes module. Paths here are relative to `/notes`
 * (the shell strips the module prefix). Every page and database gets a short,
 * readable, bookmarkable path built only from names:
 *   /page/life/travel/japan      (ancestor pages, then the page)
 *   /database/projects/todos     (containing folder, then the database)
 * Names that collide among siblings are numbered in creation order
 * (`notes`, `notes-2`, …) so every path is unique. Because paths are derived
 * from names, renaming or moving an item changes its URL (the address bar is
 * rewritten in place). Legacy `…/<slug>-<id>` links still resolve by id.
 */
export type Selection =
  | { kind: "page"; id: string }
  | { kind: "database"; id: string }
  | null;

type Kind = "page" | "database";

interface RouteData {
  pages: PageMap;
  databases: DatabaseMap;
}

export interface RouteTable {
  pathOf: Map<string, string>; // `${kind}:${id}` -> path
  byPath: Map<string, Selection>; // path -> selection
}

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

interface Node {
  id: string;
  name?: string;
  createdAt?: number;
}

/**
 * Unique slug per item within one sibling group: first-created keeps the bare
 * slug, later duplicates get `-2`, `-3`, … (skipping any already taken).
 */
function siblingSlugs(items: Node[]): Map<string, string> {
  const out = new Map<string, string>();
  const sorted = [...items].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id)
  );
  // Claim bare slugs first so a duplicate "notes" can't take "notes-2" from
  // an item literally named "notes 2".
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

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const arr = m.get(k);
    if (arr) arr.push(it);
    else m.set(k, [it]);
  }
  return m;
}

export function buildRouteTable(data: RouteData): RouteTable {
  const pathOf = new Map<string, string>();
  const byPath = new Map<string, Selection>();
  const add = (kind: Kind, id: string, path: string) => {
    pathOf.set(`${kind}:${id}`, path);
    byPath.set(path, { kind, id });
  };

  // Pages: dedupe among siblings, then join ancestor segments.
  const pages = Object.values(data.pages);
  const pageSeg = new Map<string, string>();
  for (const group of groupBy(pages, (p) => p.parentId ?? "").values()) {
    for (const [id, s] of siblingSlugs(group.map((p) => ({ ...p, name: p.title })))) {
      pageSeg.set(id, s);
    }
  }
  for (const page of pages) {
    const segs = [pageSeg.get(page.id)!];
    const seen = new Set([page.id]);
    let cur = page.parentId ? data.pages[page.parentId] : undefined;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      segs.unshift(pageSeg.get(cur.id)!);
      cur = cur.parentId ? data.pages[cur.parentId] : undefined;
    }
    add("page", page.id, `/page/${segs.join("/")}`);
  }

  // Databases: folders dedupe among folders; items dedupe within
  // their folder (or the top level).
  const flat = (kind: "database", map: Record<string, unknown>) => {
    const all = Object.values(map) as (Node & { kind?: string; folderId?: string | null })[];
    const folders = all.filter((x) => x.kind === "folder");
    const items = all.filter((x) => x.kind !== "folder");
    const folderSeg = siblingSlugs(folders);
    for (const group of groupBy(items, (x) => x.folderId ?? "").values()) {
      for (const [id, s] of siblingSlugs(group)) {
        const item = map[id] as { folderId?: string | null };
        const f = item.folderId ? folderSeg.get(item.folderId) : undefined;
        add(kind, id, `/${kind}/${f ? `${f}/` : ""}${s}`);
      }
    }
  };
  flat("database", data.databases);

  return { pathOf, byPath };
}

export function buildPath(sel: Selection, table: RouteTable): string {
  if (!sel) return "/";
  return table.pathOf.get(`${sel.kind}:${sel.id}`) ?? "/";
}

export function parsePath(pathname: string, data: RouteData, table: RouteTable): Selection {
  let path: string;
  try {
    path = "/" + pathname.split("/").filter(Boolean).map(decodeURIComponent).join("/");
  } catch {
    return null;
  }
  const exact = table.byPath.get(path.toLowerCase());
  if (exact) return exact;

  // Legacy links: `/<kind>/…/<slug>-<id>` — resolve by the trailing id.
  const segs = path.split("/").filter(Boolean);
  const kind = segs[0] as Kind;
  if (segs.length < 2 || !["page", "database"].includes(kind)) return null;
  const last = segs[segs.length - 1];
  const map = (
    kind === "page" ? data.pages : data.databases
  ) as Record<string, { kind?: string }>;
  const id = Object.keys(map).find(
    (k) => (last === k || last.endsWith(`-${k}`)) && map[k]?.kind !== "folder"
  );
  return id ? { kind, id } : null;
}

/** Display name for the browser tab title. */
export function selectionTitle(sel: Selection, data: RouteData): string | null {
  if (!sel) return null;
  if (sel.kind === "page") return data.pages[sel.id]?.title || "Untitled";
  const item = data.databases[sel.id] as { name?: string } | undefined;
  return item ? item.name || "Untitled" : null;
}
