import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CellValue,
  Database,
  DatabaseMap,
  Page,
  PageMap,
  PropertyDef,
  PropertyType,
  ViewType,
} from "./types";
import { getAdapter, type CollectionDelta } from "./storage/adapters";

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
  updatePage: (id: string, patch: Partial<Pick<Page, "title" | "content">>) => void;
  deletePage: (id: string) => void;

  /* databases */
  databases: Database[];
  getDatabase: (id: string) => Database | undefined;
  createDatabase: () => string;
  renameDatabase: (dbId: string, name: string) => void;
  deleteDatabase: (dbId: string) => void;
  setActiveView: (dbId: string, viewId: string) => void;
  addView: (dbId: string, type: ViewType) => void;
  deleteView: (dbId: string, viewId: string) => void;
  renameView: (dbId: string, viewId: string, name: string) => void;
  addProperty: (dbId: string, name: string, type: PropertyType) => void;
  updateProperty: (dbId: string, propId: string, patch: Partial<PropertyDef>) => void;
  deleteProperty: (dbId: string, propId: string) => void;
  addRow: (dbId: string) => void;
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
        setPages(p);
        setDatabases(d);
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
        .sort((a, b) => a.createdAt - b.createdAt),
    [pages]
  );

  const createPage = useCallback((parentId: string | null, title = "untitled") => {
    const id = uid();
    const now = Date.now();
    const page: Page = { id, title, content: "", parentId, createdAt: now, updatedAt: now };
    setPages((prev) => ({ ...prev, [id]: page }));
    return id;
  }, []);

  const updatePage = useCallback(
    (id: string, patch: Partial<Pick<Page, "title" | "content">>) => {
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

  // Immutably patch a single database through the updater.
  const patchDb = useCallback((dbId: string, fn: (db: Database) => Database) => {
    setDatabases((prev) => {
      const db = prev[dbId];
      if (!db) return prev;
      return { ...prev, [dbId]: { ...fn(db), updatedAt: Date.now() } };
    });
  }, []);

  const databasesList = useCallback(
    () =>
      Object.values(databases).sort((a, b) => a.createdAt - b.createdAt),
    [databases]
  );

  const getDatabase = useCallback((id: string) => databases[id], [databases]);

  const createDatabase = useCallback(() => {
    const id = uid();
    const now = Date.now();
    const titleProp: PropertyDef = { id: uid(), name: "Name", type: "text" };
    const statusProp: PropertyDef = {
      id: uid(),
      name: "Status",
      type: "select",
      options: ["todo", "doing", "done"],
    };
    const dateProp: PropertyDef = { id: uid(), name: "Date", type: "date" };
    const tableView = { id: uid(), name: "Table", type: "table" as ViewType };
    const db: Database = {
      id,
      name: "Untitled database",
      properties: [titleProp, statusProp, dateProp],
      rows: [
        { id: uid(), cells: { [titleProp.id]: "First item" }, createdAt: now },
      ],
      views: [tableView],
      activeViewId: tableView.id,
      createdAt: now,
      updatedAt: now,
    };
    setDatabases((prev) => ({ ...prev, [id]: db }));
    return id;
  }, []);

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
      patchDb(dbId, (db) => ({
        ...db,
        properties: db.properties.map((p) =>
          p.id === propId
            ? {
                ...p,
                ...patch,
                // Ensure select properties always have an options array.
                ...(patch.type === "select" && !p.options ? { options: [] } : {}),
              }
            : p
        ),
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
    (dbId: string) =>
      patchDb(dbId, (db) => ({
        ...db,
        rows: [...db.rows, { id: uid(), cells: {}, createdAt: Date.now() }],
      })),
    [patchDb]
  );

  const updateCell = useCallback(
    (dbId: string, rowId: string, propId: string, value: CellValue) =>
      patchDb(dbId, (db) => ({
        ...db,
        rows: db.rows.map((r) =>
          r.id === rowId ? { ...r, cells: { ...r.cells, [propId]: value } } : r
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
    updatePage,
    deletePage,
    databases: databasesList(),
    getDatabase,
    createDatabase,
    renameDatabase,
    deleteDatabase,
    setActiveView,
    addView,
    deleteView,
    renameView,
    addProperty,
    updateProperty,
    deleteProperty,
    addRow,
    updateCell,
    deleteRow,
    updateDatabase,
  };
}
