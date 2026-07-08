import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CellValue,
  Database,
  DatabaseMap,
  DatabaseView,
  DbItem,
  Folder,
  Page,
  PageMap,
  PropertyDef,
  PropertyType,
  SelectColor,
  SelectOption,
  ViewType,
} from "./types";
import { isDatabase, isFolder } from "./types";
import { getAdapter, type CollectionDelta } from "./storage/adapters";
import { colorForIndex, migrateDatabases } from "./storage/migrateDatabases";

/**
 * Assign a sequential `order` to every page that lacks one, grouped by parent
 * and seeded from the existing createdAt sort. Identity-preserving: pages that
 * already have an order keep their exact object, so the debounced diff-save
 * only re-persists the ones this actually numbered.
 */
function normalizePageOrder(map: PageMap): PageMap {
  const byParent = new Map<string | null, Page[]>();
  for (const p of Object.values(map)) {
    const list = byParent.get(p.parentId) ?? [];
    list.push(p);
    byParent.set(p.parentId, list);
  }
  let changed = false;
  const next: PageMap = { ...map };
  for (const siblings of byParent.values()) {
    if (siblings.every((p) => p.order !== undefined)) continue;
    siblings.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
    siblings.forEach((p, i) => {
      if (p.order !== i) {
        next[p.id] = { ...p, order: i };
        changed = true;
      }
    });
  }
  return changed ? next : map;
}

/**
 * Assign a sequential `order` to top-level database items lacking one, seeded
 * from the current createdAt sort. Identity-preserving (same as pages). Only
 * legacy databases are touched (folders always carry an order).
 */
function normalizeDbOrder(map: DatabaseMap): DatabaseMap {
  const topLevel = Object.values(map).filter(
    (it) => isFolder(it) || (it.folderId ?? null) === null
  );
  if (topLevel.every((it) => it.order !== undefined)) return map;
  topLevel.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  let changed = false;
  const next: DatabaseMap = { ...map };
  topLevel.forEach((it, i) => {
    if (it.order !== i) {
      next[it.id] = { ...it, order: i } as DbItem;
      changed = true;
    }
  });
  return changed ? next : map;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Diff a previously-persisted snapshot against the current map. Because the
 * store is strictly immutable (every update produces a new object for the
 * changed entity and preserves identity for the rest), a reference comparison
 * is enough to find exactly what changed. Returns null when nothing changed.
 */
function diffMap<T>(
  prev: Record<string, T>,
  next: Record<string, T>
): CollectionDelta<T> | null {
  const upserts: Record<string, T> = {};
  let changed = false;
  for (const id in next) {
    if (next[id] !== prev[id]) {
      upserts[id] = next[id];
      changed = true;
    }
  }
  const deletes: string[] = [];
  for (const id in prev) {
    if (!(id in next)) {
      deletes.push(id);
      changed = true;
    }
  }
  return changed ? { upserts, deletes } : null;
}

export interface Store {
  /** False until the initial load from the data source has completed. */
  loaded: boolean;
  pages: PageMap;
  /** Top-level projects, sorted oldest-first. */
  roots: Page[];
  childrenOf: (parentId: string | null) => Page[];
  createPage: (parentId: string | null, title?: string) => string;
  /** Reorder/re-parent a page: place `id` under `newParentId` at `index`. */
  movePage: (id: string, newParentId: string | null, index: number) => void;
  updatePage: (
    id: string,
    patch: Partial<Pick<Page, "title" | "content" | "icon" | "iconColor" | "cover">>
  ) => void;
  deletePage: (id: string) => void;

  /* databases */
  databases: Database[];
  /** Interleaved top-level sidebar items (folders + un-foldered databases). */
  topLevelDbItems: DbItem[];
  folders: Folder[];
  databasesInFolder: (folderId: string) => Database[];
  getDatabase: (id: string) => Database | undefined;
  createDatabase: () => string;
  createFolder: (name?: string) => string;
  renameFolder: (folderId: string, name: string) => void;
  /** Delete a folder; its databases pop back to the top level. */
  deleteFolder: (folderId: string) => void;
  /** Reorder/move a database or folder: place `id` in `folderId` at `index`. */
  moveDbItem: (id: string, folderId: string | null, index: number) => void;
  renameDatabase: (dbId: string, name: string) => void;
  deleteDatabase: (dbId: string) => void;
  setActiveView: (dbId: string, viewId: string) => void;
  addView: (dbId: string, type: ViewType) => void;
  deleteView: (dbId: string, viewId: string) => void;
  renameView: (dbId: string, viewId: string, name: string) => void;
  addProperty: (dbId: string, name: string, type: PropertyType) => void;
  updateProperty: (dbId: string, propId: string, patch: Partial<PropertyDef>) => void;
  deleteProperty: (dbId: string, propId: string) => void;
  /** Move the property at `from` to position `to` (title stays at index 0). */
  reorderProperties: (dbId: string, from: number, to: number) => void;
  /** Add a select option; returns its id so callers can select it right away. */
  addSelectOption: (dbId: string, propId: string, name: string, color?: SelectColor) => string;
  updateSelectOption: (
    dbId: string,
    propId: string,
    optId: string,
    patch: Partial<Pick<SelectOption, "name" | "color">>
  ) => void;
  /** Delete an option and strip it from every row's cell value. */
  deleteSelectOption: (dbId: string, propId: string, optId: string) => void;
  /** Patch per-view config (filters, sort, grouping, cover fit, …). */
  updateView: (dbId: string, viewId: string, patch: Partial<DatabaseView>) => void;
  addRow: (dbId: string, cells?: Record<string, CellValue>) => void;
  updateCell: (dbId: string, rowId: string, propId: string, value: CellValue) => void;
  deleteRow: (dbId: string, rowId: string) => void;
  /** Apply an arbitrary immutable transform to a database (used by import). */
  updateDatabase: (dbId: string, fn: (db: Database) => Database) => void;
}

export function useStore(): Store {
  // The backend (localStorage or API) is chosen once per session; switching it
  // in settings reloads the app, so memoizing here is safe.
  const adapter = useMemo(() => getAdapter(), []);

  const [pages, setPages] = useState<PageMap>({});
  const [databases, setDatabases] = useState<DatabaseMap>({});
  const [loaded, setLoaded] = useState(false);

  // Snapshots of what is currently persisted, used to diff for incremental
  // saves. Kept in sync with the backend: seeded on load, advanced after each
  // successful flush. On a failed save they are left untouched so the next
  // flush re-sends the same delta (plus anything new).
  const savedPages = useRef<PageMap>({});
  const savedDbs = useRef<DatabaseMap>({});

  // Initial load from the configured data source.
  useEffect(() => {
    let cancelled = false;
    Promise.all([adapter.loadPages(), adapter.loadDatabases()])
      .then(([p, d]) => {
        if (cancelled) return;
        // One-time normalizations (page order; string select options -> coloured
        // objects). The saved snapshots keep the *raw* maps so the first
        // debounced flush persists exactly the entities that changed.
        setPages(normalizePageOrder(p));
        setDatabases(normalizeDbOrder(migrateDatabases(d)));
        savedPages.current = p;
        savedDbs.current = d;
      })
      .catch((err) => console.error("[cortex] failed to load data:", err))
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [adapter]);

  // Debounced persistence. Guarded by `loaded` so the empty initial state is
  // never written back over real data before the load finishes. Only the
  // entities that changed since the last save are sent (see `diffMap`), so a
  // single edit never re-serializes the whole collection.
  const pagesTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(pagesTimer.current);
    pagesTimer.current = window.setTimeout(() => {
      const delta = diffMap(savedPages.current, pages);
      if (!delta) return;
      adapter
        .savePages(delta)
        .then(() => {
          savedPages.current = pages;
        })
        .catch((err) => console.error("[cortex] failed to save pages:", err));
    }, 250);
    return () => window.clearTimeout(pagesTimer.current);
  }, [pages, loaded, adapter]);

  const dbTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(dbTimer.current);
    dbTimer.current = window.setTimeout(() => {
      const delta = diffMap(savedDbs.current, databases);
      if (!delta) return;
      adapter
        .saveDatabases(delta)
        .then(() => {
          savedDbs.current = databases;
        })
        .catch((err) => console.error("[cortex] failed to save databases:", err));
    }, 250);
    return () => window.clearTimeout(dbTimer.current);
  }, [databases, loaded, adapter]);

  /* ------------------------------- pages ------------------------------- */

  const childrenOf = useCallback(
    (parentId: string | null) =>
      Object.values(pages)
        .filter((p) => p.parentId === parentId)
        // `order` is authoritative once assigned (normalizePageOrder / moves);
        // createdAt is the fallback for any not-yet-numbered page.
        .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt)),
    [pages]
  );

  const createPage = useCallback((parentId: string | null, title = "untitled") => {
    const id = uid();
    const now = Date.now();
    setPages((prev) => {
      // Append after existing siblings.
      const maxOrder = Object.values(prev)
        .filter((p) => p.parentId === parentId)
        .reduce((m, p) => Math.max(m, p.order ?? -1), -1);
      const page: Page = {
        id,
        title,
        content: "",
        parentId,
        order: maxOrder + 1,
        createdAt: now,
        updatedAt: now,
      };
      return { ...prev, [id]: page };
    });
    return id;
  }, []);

  const movePage = useCallback(
    (id: string, newParentId: string | null, index: number) => {
      setPages((prev) => {
        const moved = prev[id];
        if (!moved) return prev;
        if (newParentId === id) return prev;
        // Cycle guard: can't drop a page inside its own subtree.
        if (newParentId !== null) {
          let cursor: string | null = newParentId;
          while (cursor !== null) {
            if (cursor === id) return prev;
            cursor = prev[cursor]?.parentId ?? null;
          }
        }
        // Ordered siblings of the destination, excluding the moved page.
        const siblings = Object.values(prev)
          .filter((p) => p.parentId === newParentId && p.id !== id)
          .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
        const clamped = Math.max(0, Math.min(index, siblings.length));
        siblings.splice(clamped, 0, moved);

        const next = { ...prev };
        siblings.forEach((p, i) => {
          if (p.id === id) {
            next[id] = { ...moved, parentId: newParentId, order: i, updatedAt: Date.now() };
          } else if (p.order !== i) {
            next[p.id] = { ...p, order: i };
          }
        });
        return next;
      });
    },
    []
  );

  const updatePage = useCallback(
    (
      id: string,
      patch: Partial<Pick<Page, "title" | "content" | "icon" | "iconColor" | "cover">>
    ) => {
      setPages((prev) => {
        const existing = prev[id];
        if (!existing) return prev;
        return { ...prev, [id]: { ...existing, ...patch, updatedAt: Date.now() } };
      });
    },
    []
  );

  const deletePage = useCallback((id: string) => {
    const removed: string[] = [];
    setPages((prev) => {
      const next = { ...prev };
      const walk = (pid: string) => {
        removed.push(pid);
        for (const p of Object.values(next)) {
          if (p.parentId === pid) walk(p.id);
        }
      };
      walk(id);
      for (const rid of removed) delete next[rid];

      // Strip subpage links to deleted pages from remaining pages' content.
      for (const page of Object.values(next)) {
        let content = page.content;
        let changed = false;
        for (const rid of removed) {
          const re = new RegExp(
            `<a\\b[^>]*data-subpage-link[^>]*data-page-id="${rid}"[^>]*>.*?</a>`,
            "gi"
          );
          if (re.test(content)) {
            content = content.replace(re, "");
            changed = true;
          }
        }
        if (changed) {
          next[page.id] = { ...next[page.id], content, updatedAt: Date.now() };
        }
      }

      return next;
    });
  }, []);

  const roots = childrenOf(null);

  /* ----------------------------- databases ----------------------------- */

  // Immutably patch a single database through the updater. No-op on folders.
  const patchDb = useCallback((dbId: string, fn: (db: Database) => Database) => {
    setDatabases((prev) => {
      const db = prev[dbId];
      if (!db || !isDatabase(db)) return prev;
      return { ...prev, [dbId]: { ...fn(db), updatedAt: Date.now() } };
    });
  }, []);

  const byOrder = (a: DbItem, b: DbItem) =>
    (a.order ?? a.createdAt) - (b.order ?? b.createdAt);

  const databasesList = useCallback(
    () => Object.values(databases).filter(isDatabase).sort(byOrder),
    [databases]
  );

  const foldersList = useCallback(
    () => Object.values(databases).filter(isFolder).sort(byOrder),
    [databases]
  );

  // Interleaved top level: folders + databases with no folderId, by order.
  const topLevelDbItems = useCallback(
    () =>
      Object.values(databases)
        .filter((it) => isFolder(it) || (it.folderId ?? null) === null)
        .sort(byOrder),
    [databases]
  );

  const databasesInFolder = useCallback(
    (folderId: string) =>
      Object.values(databases)
        .filter((it): it is Database => isDatabase(it) && it.folderId === folderId)
        .sort(byOrder),
    [databases]
  );

  const getDatabase = useCallback(
    (id: string) => {
      const it = databases[id];
      return it && isDatabase(it) ? it : undefined;
    },
    [databases]
  );

  const createDatabase = useCallback(() => {
    const id = uid();
    const now = Date.now();
    const titleProp: PropertyDef = { id: uid(), name: "Name", type: "text" };
    const statusProp: PropertyDef = {
      id: uid(),
      name: "Status",
      type: "select",
      options: [
        { id: uid(), name: "todo", color: "red" },
        { id: uid(), name: "doing", color: "yellow" },
        { id: uid(), name: "done", color: "green" },
      ],
    };
    const dateProp: PropertyDef = { id: uid(), name: "Date", type: "date" };
    const tableView = { id: uid(), name: "Table", type: "table" as ViewType };
    const db: Database = {
      id,
      name: "Untitled database",
      properties: [titleProp, statusProp, dateProp],
      rows: [
        { id: uid(), cells: { [titleProp.id]: "First item" }, createdAt: now, updatedAt: now, seq: 1 },
      ],
      views: [tableView],
      activeViewId: tableView.id,
      nextSeq: 2,
      folderId: null,
      createdAt: now,
      updatedAt: now,
    };
    setDatabases((prev) => {
      const maxOrder = Object.values(prev)
        .filter((it) => isFolder(it) || (it.folderId ?? null) === null)
        .reduce((m, it) => Math.max(m, it.order ?? -1), -1);
      return { ...prev, [id]: { ...db, order: maxOrder + 1 } };
    });
    return id;
  }, []);

  const createFolder = useCallback((name = "New folder") => {
    const id = uid();
    const now = Date.now();
    setDatabases((prev) => {
      const maxOrder = Object.values(prev)
        .filter((it) => isFolder(it) || (it.folderId ?? null) === null)
        .reduce((m, it) => Math.max(m, it.order ?? -1), -1);
      const folder: Folder = {
        kind: "folder",
        id,
        name,
        order: maxOrder + 1,
        createdAt: now,
      };
      return { ...prev, [id]: folder };
    });
    return id;
  }, []);

  const renameFolder = useCallback((folderId: string, name: string) => {
    setDatabases((prev) => {
      const f = prev[folderId];
      if (!f || !isFolder(f)) return prev;
      return { ...prev, [folderId]: { ...f, name } };
    });
  }, []);

  const deleteFolder = useCallback((folderId: string) => {
    setDatabases((prev) => {
      const f = prev[folderId];
      if (!f || !isFolder(f)) return prev;
      const next = { ...prev };
      delete next[folderId];
      // Pop contained databases back to the top level, appended after existing.
      let maxTop = Object.values(next)
        .filter((it) => isFolder(it) || (it.folderId ?? null) === null)
        .reduce((m, it) => Math.max(m, it.order ?? -1), -1);
      for (const it of Object.values(prev)) {
        if (isDatabase(it) && it.folderId === folderId) {
          maxTop += 1;
          next[it.id] = { ...it, folderId: null, order: maxTop };
        }
      }
      return next;
    });
  }, []);

  const moveDbItem = useCallback(
    (id: string, folderId: string | null, index: number) => {
      setDatabases((prev) => {
        const moved = prev[id];
        if (!moved) return prev;
        // Folders can only live at the top level (no nesting).
        if (isFolder(moved) && folderId !== null) return prev;
        // A database's target folder must actually be a folder.
        if (folderId !== null && !isFolder(prev[folderId])) return prev;

        const inContainer = (it: DbItem) =>
          folderId === null
            ? isFolder(it) || (it.folderId ?? null) === null
            : isDatabase(it) && it.folderId === folderId;

        const siblings = Object.values(prev)
          .filter((it) => it.id !== id && inContainer(it))
          .sort(byOrder);
        const clamped = Math.max(0, Math.min(index, siblings.length));
        siblings.splice(clamped, 0, moved);

        const next = { ...prev };
        siblings.forEach((it, i) => {
          if (it.id === id) {
            next[id] = isFolder(moved)
              ? { ...moved, order: i }
              : { ...(moved as Database), folderId, order: i, updatedAt: Date.now() };
          } else if (it.order !== i) {
            next[it.id] = { ...it, order: i } as DbItem;
          }
        });
        return next;
      });
    },
    []
  );

  const renameDatabase = useCallback(
    (dbId: string, name: string) => patchDb(dbId, (db) => ({ ...db, name })),
    [patchDb]
  );

  const deleteDatabase = useCallback((dbId: string) => {
    setDatabases((prev) => {
      const next = { ...prev };
      delete next[dbId];
      return next;
    });
  }, []);

  const setActiveView = useCallback(
    (dbId: string, viewId: string) => patchDb(dbId, (db) => ({ ...db, activeViewId: viewId })),
    [patchDb]
  );

  const addView = useCallback(
    (dbId: string, type: ViewType) =>
      patchDb(dbId, (db) => {
        const view = {
          id: uid(),
          name: type[0].toUpperCase() + type.slice(1),
          type,
        };
        return { ...db, views: [...db.views, view], activeViewId: view.id };
      }),
    [patchDb]
  );

  const deleteView = useCallback(
    (dbId: string, viewId: string) =>
      patchDb(dbId, (db) => {
        if (db.views.length <= 1) return db; // keep at least one view
        const views = db.views.filter((v) => v.id !== viewId);
        const activeViewId = db.activeViewId === viewId ? views[0].id : db.activeViewId;
        return { ...db, views, activeViewId };
      }),
    [patchDb]
  );

  const renameView = useCallback(
    (dbId: string, viewId: string, name: string) =>
      patchDb(dbId, (db) => ({
        ...db,
        views: db.views.map((v) => (v.id === viewId ? { ...v, name } : v)),
      })),
    [patchDb]
  );

  const addProperty = useCallback(
    (dbId: string, name: string, type: PropertyType) =>
      patchDb(dbId, (db) => {
        const prop: PropertyDef = {
          id: uid(),
          name,
          type,
          ...(type === "select" ? { options: [] } : {}),
        };
        return { ...db, properties: [...db.properties, prop] };
      }),
    [patchDb]
  );

  const updateProperty = useCallback(
    (dbId: string, propId: string, patch: Partial<PropertyDef>) =>
      patchDb(dbId, (db) => {
        const prev = db.properties.find((p) => p.id === propId);
        if (!prev) return db;
        const isSelectType = (t?: PropertyType) => t === "select" || t === "multiselect";
        const next = {
          ...prev,
          ...patch,
          // Ensure select-ish properties always have an options array.
          ...(isSelectType(patch.type) && !prev.options ? { options: [] } : {}),
        };
        let rows = db.rows;
        // Converting between select and multiselect reshapes cell values.
        if (patch.type && patch.type !== prev.type) {
          if (prev.type === "select" && patch.type === "multiselect") {
            rows = db.rows.map((r) => {
              const v = r.cells[propId];
              return typeof v === "string" && v
                ? { ...r, cells: { ...r.cells, [propId]: [v] } }
                : r;
            });
          } else if (prev.type === "multiselect" && patch.type === "select") {
            rows = db.rows.map((r) => {
              const v = r.cells[propId];
              return Array.isArray(v)
                ? { ...r, cells: { ...r.cells, [propId]: v[0] ?? null } }
                : r;
            });
          }
        }
        return {
          ...db,
          properties: db.properties.map((p) => (p.id === propId ? next : p)),
          rows,
        };
      }),
    [patchDb]
  );

  const reorderProperties = useCallback(
    (dbId: string, from: number, to: number) =>
      patchDb(dbId, (db) => {
        // The title property is pinned at index 0.
        if (from === to || from === 0 || to === 0) return db;
        if (from < 0 || from >= db.properties.length) return db;
        if (to < 0 || to >= db.properties.length) return db;
        const properties = [...db.properties];
        const [moved] = properties.splice(from, 1);
        properties.splice(to, 0, moved);
        return { ...db, properties };
      }),
    [patchDb]
  );

  const addSelectOption = useCallback(
    (dbId: string, propId: string, name: string, color?: SelectColor) => {
      const id = uid();
      patchDb(dbId, (db) => ({
        ...db,
        properties: db.properties.map((p) => {
          if (p.id !== propId) return p;
          const options = p.options ?? [];
          return {
            ...p,
            options: [...options, { id, name, color: color ?? colorForIndex(options.length) }],
          };
        }),
      }));
      return id;
    },
    [patchDb]
  );

  const updateSelectOption = useCallback(
    (
      dbId: string,
      propId: string,
      optId: string,
      patch: Partial<Pick<SelectOption, "name" | "color">>
    ) =>
      patchDb(dbId, (db) => ({
        ...db,
        properties: db.properties.map((p) =>
          p.id === propId
            ? {
                ...p,
                options: (p.options ?? []).map((o) =>
                  o.id === optId ? { ...o, ...patch } : o
                ),
              }
            : p
        ),
      })),
    [patchDb]
  );

  const deleteSelectOption = useCallback(
    (dbId: string, propId: string, optId: string) =>
      patchDb(dbId, (db) => ({
        ...db,
        properties: db.properties.map((p) =>
          p.id === propId
            ? { ...p, options: (p.options ?? []).filter((o) => o.id !== optId) }
            : p
        ),
        // Strip the deleted option from every row that referenced it.
        rows: db.rows.map((r) => {
          const v = r.cells[propId];
          if (v === optId) return { ...r, cells: { ...r.cells, [propId]: null } };
          if (Array.isArray(v) && v.includes(optId)) {
            return { ...r, cells: { ...r.cells, [propId]: v.filter((x) => x !== optId) } };
          }
          return r;
        }),
      })),
    [patchDb]
  );

  const updateView = useCallback(
    (dbId: string, viewId: string, patch: Partial<DatabaseView>) =>
      patchDb(dbId, (db) => ({
        ...db,
        views: db.views.map((v) => (v.id === viewId ? { ...v, ...patch } : v)),
      })),
    [patchDb]
  );

  const deleteProperty = useCallback(
    (dbId: string, propId: string) =>
      patchDb(dbId, (db) => {
        // The first (title) property is protected.
        if (db.properties[0]?.id === propId) return db;
        return {
          ...db,
          properties: db.properties.filter((p) => p.id !== propId),
          rows: db.rows.map((r) => {
            const cells = { ...r.cells };
            delete cells[propId];
            return { ...r, cells };
          }),
        };
      }),
    [patchDb]
  );

  const addRow = useCallback(
    (dbId: string, cells: Record<string, CellValue> = {}) =>
      patchDb(dbId, (db) => {
        const seq = db.nextSeq ?? db.rows.length + 1;
        const now = Date.now();
        return {
          ...db,
          nextSeq: seq + 1,
          rows: [...db.rows, { id: uid(), cells, createdAt: now, updatedAt: now, seq }],
        };
      }),
    [patchDb]
  );

  const updateCell = useCallback(
    (dbId: string, rowId: string, propId: string, value: CellValue) =>
      patchDb(dbId, (db) => ({
        ...db,
        rows: db.rows.map((r) =>
          r.id === rowId
            ? { ...r, cells: { ...r.cells, [propId]: value }, updatedAt: Date.now() }
            : r
        ),
      })),
    [patchDb]
  );

  const deleteRow = useCallback(
    (dbId: string, rowId: string) =>
      patchDb(dbId, (db) => ({ ...db, rows: db.rows.filter((r) => r.id !== rowId) })),
    [patchDb]
  );

  const updateDatabase = useCallback(
    (dbId: string, fn: (db: Database) => Database) => patchDb(dbId, fn),
    [patchDb]
  );

  return {
    loaded,
    pages,
    roots,
    childrenOf,
    createPage,
    movePage,
    updatePage,
    deletePage,
    databases: databasesList(),
    topLevelDbItems: topLevelDbItems(),
    folders: foldersList(),
    databasesInFolder,
    getDatabase,
    createDatabase,
    createFolder,
    renameFolder,
    deleteFolder,
    moveDbItem,
    renameDatabase,
    deleteDatabase,
    setActiveView,
    addView,
    deleteView,
    renameView,
    addProperty,
    updateProperty,
    deleteProperty,
    reorderProperties,
    addSelectOption,
    updateSelectOption,
    deleteSelectOption,
    updateView,
    addRow,
    updateCell,
    deleteRow,
    updateDatabase,
  };
}
