import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, newId } from "@cortex/core";
import { isDashboard, isFolder, type Dashboard, type DashboardMap, type DashItem, type Folder } from "./types";

/*
 * Dashboards store, ported from the v0 store's dashboard half. Strictly
 * immutable: every update creates a new object for the changed entity and
 * keeps identity for the rest, so a reference diff against the last saved
 * snapshot finds exactly what to send to /api/home/sync.
 */

interface Delta {
  upserts: Record<string, DashItem>;
  deletes: string[];
}

function diffMap(prev: DashboardMap, next: DashboardMap): Delta | null {
  const upserts: Record<string, DashItem> = {};
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

/** Number top-level items lacking an order (identity-preserving). */
function normalizeOrder(map: DashboardMap): DashboardMap {
  const top = Object.values(map).filter((it) => isFolder(it) || (it.folderId ?? null) === null);
  if (top.every((it) => it.order !== undefined)) return map;
  top.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  const next = { ...map };
  let changed = false;
  top.forEach((it, i) => {
    if (it.order !== i) {
      next[it.id] = { ...it, order: i } as DashItem;
      changed = true;
    }
  });
  return changed ? next : map;
}

const byOrder = (a: DashItem, b: DashItem) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
const topLevelMax = (map: DashboardMap) =>
  Object.values(map)
    .filter((it) => isFolder(it) || (it.folderId ?? null) === null)
    .reduce((m, it) => Math.max(m, it.order ?? -1), -1);

export interface DashStore {
  loaded: boolean;
  loadError: string | null;
  map: DashboardMap;
  dashboards: Dashboard[];
  topLevelDashItems: DashItem[];
  dashboardsInFolder: (folderId: string) => Dashboard[];
  getDashboard: (id: string) => Dashboard | undefined;
  createDashboard: (init?: Partial<Dashboard>) => string;
  renameDashboard: (id: string, name: string) => void;
  updateDashboard: (id: string, fn: (d: Dashboard) => Dashboard) => void;
  deleteDashboard: (id: string) => void;
  createDashFolder: (name?: string) => string;
  renameDashFolder: (id: string, name: string) => void;
  deleteDashFolder: (id: string) => void;
  moveDashItem: (id: string, folderId: string | null, index: number) => void;
  /** Backup import: replace or merge the whole collection; the diff-save persists it. */
  replaceAll: (map: DashboardMap) => void;
}

export function useDashStore(): DashStore {
  const [map, setMap] = useState<DashboardMap>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const saved = useRef<DashboardMap>({});

  useEffect(() => {
    let cancelled = false;
    api<{ dashboards: DashboardMap }>("/home")
      .then(({ dashboards }) => {
        if (cancelled) return;
        saved.current = dashboards;
        setMap(normalizeOrder(dashboards));
        setLoaded(true);
      })
      // Stay unloaded on failure so nothing can be saved over the server's data.
      .catch((e) => !cancelled && setLoadError(String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!loaded) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const delta = diffMap(saved.current, map);
      if (!delta) return;
      api("/home/sync", { method: "POST", json: { dashboards: delta } })
        .then(() => {
          saved.current = map;
        })
        .catch((e) => console.error("[cortex] failed to save dashboards:", e));
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [map, loaded]);

  const patch = useCallback((id: string, fn: (d: Dashboard) => Dashboard) => {
    setMap((prev) => {
      const it = prev[id];
      if (!it || !isDashboard(it)) return prev;
      return { ...prev, [id]: { ...fn(it), updatedAt: Date.now() } };
    });
  }, []);

  const createDashboard = useCallback((init?: Partial<Dashboard>) => {
    const id = newId();
    const now = Date.now();
    setMap((prev) => ({
      ...prev,
      [id]: {
        id,
        name: "New dashboard",
        widgets: [],
        columns: 12,
        rows: 8,
        rowHeight: 80,
        sizing: "fit",
        folderId: null,
        createdAt: now,
        updatedAt: now,
        ...init,
        order: topLevelMax(prev) + 1,
      } as Dashboard,
    }));
    return id;
  }, []);

  const deleteDashboard = useCallback((id: string) => {
    setMap((prev) => {
      if (!isDashboard(prev[id])) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const createDashFolder = useCallback((name = "New folder") => {
    const id = newId();
    setMap((prev) => ({ ...prev, [id]: { kind: "folder", id, name, order: topLevelMax(prev) + 1, createdAt: Date.now() } as Folder }));
    return id;
  }, []);

  const renameDashFolder = useCallback((id: string, name: string) => {
    setMap((prev) => {
      const f = prev[id];
      return f && isFolder(f) ? { ...prev, [id]: { ...f, name } } : prev;
    });
  }, []);

  const deleteDashFolder = useCallback((id: string) => {
    setMap((prev) => {
      const f = prev[id];
      if (!f || !isFolder(f)) return prev;
      const next = { ...prev };
      delete next[id];
      // Contained dashboards pop back to the top level, after existing items.
      let max = topLevelMax(next);
      for (const it of Object.values(prev)) {
        if (isDashboard(it) && it.folderId === id) next[it.id] = { ...it, folderId: null, order: ++max };
      }
      return next;
    });
  }, []);

  const moveDashItem = useCallback((id: string, folderId: string | null, index: number) => {
    setMap((prev) => {
      const moved = prev[id];
      if (!moved) return prev;
      if (isFolder(moved) && folderId !== null) return prev; // no nested folders
      if (folderId !== null && !isFolder(prev[folderId])) return prev;
      const inContainer = (it: DashItem) =>
        folderId === null ? isFolder(it) || (it.folderId ?? null) === null : isDashboard(it) && it.folderId === folderId;
      const siblings = Object.values(prev).filter((it) => it.id !== id && inContainer(it)).sort(byOrder);
      siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, moved);
      const next = { ...prev };
      siblings.forEach((it, i) => {
        if (it.id === id) {
          next[id] = isFolder(moved) ? { ...moved, order: i } : { ...(moved as Dashboard), folderId, order: i, updatedAt: Date.now() };
        } else if (it.order !== i) {
          next[it.id] = { ...it, order: i } as DashItem;
        }
      });
      return next;
    });
  }, []);

  const replaceAll = useCallback((m: DashboardMap) => setMap(normalizeOrder(m)), []);

  return useMemo(() => {
    const all = Object.values(map);
    return {
      loaded,
      loadError,
      map,
      dashboards: all.filter(isDashboard).sort(byOrder),
      topLevelDashItems: all.filter((it) => isFolder(it) || (it.folderId ?? null) === null).sort(byOrder),
      dashboardsInFolder: (folderId: string) => all.filter((it): it is Dashboard => isDashboard(it) && it.folderId === folderId).sort(byOrder),
      getDashboard: (id: string) => {
        const it = map[id];
        return it && isDashboard(it) ? it : undefined;
      },
      createDashboard,
      renameDashboard: (id: string, name: string) => patch(id, (d) => ({ ...d, name })),
      updateDashboard: patch,
      deleteDashboard,
      createDashFolder,
      renameDashFolder,
      deleteDashFolder,
      moveDashItem,
      replaceAll,
    };
  }, [map, loaded, loadError, patch, createDashboard, deleteDashboard, createDashFolder, renameDashFolder, deleteDashFolder, moveDashItem, replaceAll]);
}
