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
import { getAdapter } from "./storage/adapters";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
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
}

export function useStore(): Store {
  // The backend (localStorage or API) is chosen once per session; switching it
  // in settings reloads the app, so memoizing here is safe.
  const adapter = useMemo(() => getAdapter(), []);

  const [pages, setPages] = useState<PageMap>({});
  const [databases, setDatabases] = useState<DatabaseMap>({});
  const [loaded, setLoaded] = useState(false);

  // Initial load from the configured data source.
  useEffect(() => {
    let cancelled = false;
    Promise.all([adapter.loadPages(), adapter.loadDatabases()])
      .then(([p, d]) => {
        if (cancelled) return;
        setPages(p);
        setDatabases(d);
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
  // never written back over real data before the load finishes.
  const pagesTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(pagesTimer.current);
    pagesTimer.current = window.setTimeout(() => {
      adapter.savePages(pages).catch((err) =>
        console.error("[cortex] failed to save pages:", err)
      );
    }, 250);
    return () => window.clearTimeout(pagesTimer.current);
  }, [pages, loaded, adapter]);

  const dbTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(dbTimer.current);
    dbTimer.current = window.setTimeout(() => {
      adapter.saveDatabases(databases).catch((err) =>
        console.error("[cortex] failed to save databases:", err)
      );
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
  };
}
