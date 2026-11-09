import type { DashboardMap, DashItem, DatabaseMap, DbItem, Page, PageMap } from "../types";
import { getDataSource } from "./datasource";
import { getSupabase } from "../lib/supabase";

/**
 * An incremental change to a collection: entities to upsert (keyed by id) and
 * ids to delete. The store computes this by diffing against the last-persisted
 * snapshot, so a single edit only ever writes the one entity that changed
 * instead of re-serializing the whole collection.
 */
export interface CollectionDelta<T> {
  upserts: Record<string, T>;
  deletes: string[];
}

/**
 * Persistence backend. Loads operate on whole collections (maps keyed by id);
 * saves apply an incremental delta. Both shapes match how the store already
 * thinks about its data, so swapping backends needs no changes to the store's
 * update logic.
 */
export interface StorageAdapter {
  loadPages(): Promise<PageMap>;
  savePages(delta: CollectionDelta<Page>): Promise<void>;
  loadDatabases(): Promise<DatabaseMap>;
  saveDatabases(delta: CollectionDelta<DbItem>): Promise<void>;
  loadDashboards(): Promise<DashboardMap>;
  saveDashboards(delta: CollectionDelta<DashItem>): Promise<void>;
}

const PAGES_KEY = "cortex:pages:v1";
const DB_KEY = "cortex:databases:v1";
const DASH_KEY = "cortex:dashboards:v1";

class LocalStorageAdapter implements StorageAdapter {
  private read<T>(key: string): Record<string, T> {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as Record<string, T>;
    } catch {
      /* ignore corrupt storage */
    }
    return {};
  }

  // localStorage has no partial write, so we read the current map, apply the
  // delta, and write it back. The win over a full-map save is that the store no
  // longer hands us every unchanged entity (e.g. pages full of base64 images)
  // on each keystroke — only what actually changed is merged in here.
  private applyDelta<T>(key: string, delta: CollectionDelta<T>) {
    const map = this.read<T>(key);
    for (const id of delta.deletes) delete map[id];
    Object.assign(map, delta.upserts);
    localStorage.setItem(key, JSON.stringify(map));
  }

  async loadPages() {
    return this.read<Page>(PAGES_KEY) as PageMap;
  }
  async savePages(delta: CollectionDelta<Page>) {
    this.applyDelta(PAGES_KEY, delta);
  }
  async loadDatabases() {
    return this.read<DbItem>(DB_KEY) as DatabaseMap;
  }
  async saveDatabases(delta: CollectionDelta<DbItem>) {
    this.applyDelta(DB_KEY, delta);
  }
  async loadDashboards() {
    return this.read<DashItem>(DASH_KEY) as DashboardMap;
  }
  async saveDashboards(delta: CollectionDelta<DashItem>) {
    this.applyDelta(DASH_KEY, delta);
  }
}

type Table = "pages" | "databases" | "dashboards";

const PAGE_SIZE = 1000; // PostgREST's default max-rows cap
const UPSERT_CHUNK = 50;
const DELETE_CHUNK = 200;

/**
 * Supabase (Postgres) backend. One row per entity in `pages` / `databases` /
 * `dashboards`, keyed by (user_id, id); `user_id` defaults to auth.uid() and
 * RLS scopes every query to the signed-in user, so no explicit user filter is
 * needed. Saves apply the store's delta: upsert changed rows, delete removed.
 */
class SupabaseAdapter implements StorageAdapter {
  private async load<T>(table: Table): Promise<Record<string, T>> {
    const sb = getSupabase();
    const map: Record<string, T> = {};
    // Paginate: PostgREST caps a single response at max-rows (1000 default).
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await sb
        .from(table)
        .select("id, data")
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`load ${table} failed: ${error.message}`);
      for (const row of data ?? []) map[row.id as string] = row.data as T;
      if (!data || data.length < PAGE_SIZE) break;
    }
    return map;
  }

  private async save<T>(table: Table, delta: CollectionDelta<T>): Promise<void> {
    const sb = getSupabase();
    const rows = Object.entries(delta.upserts).map(([id, data]) => ({ id, data }));
    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const { error } = await sb
        .from(table)
        .upsert(rows.slice(i, i + UPSERT_CHUNK), { onConflict: "user_id,id" });
      if (error) throw new Error(`save ${table} failed: ${error.message}`);
    }
    for (let i = 0; i < delta.deletes.length; i += DELETE_CHUNK) {
      const { error } = await sb
        .from(table)
        .delete()
        .in("id", delta.deletes.slice(i, i + DELETE_CHUNK));
      if (error) throw new Error(`delete from ${table} failed: ${error.message}`);
    }
  }

  loadPages() {
    return this.load<Page>("pages") as Promise<PageMap>;
  }
  savePages(delta: CollectionDelta<Page>) {
    return this.save("pages", delta);
  }
  loadDatabases() {
    return this.load<DbItem>("databases") as Promise<DatabaseMap>;
  }
  saveDatabases(delta: CollectionDelta<DbItem>) {
    return this.save("databases", delta);
  }
  loadDashboards() {
    return this.load<DashItem>("dashboards") as Promise<DashboardMap>;
  }
  saveDashboards(delta: CollectionDelta<DashItem>) {
    return this.save("dashboards", delta);
  }
}

/** Builds the adapter for the currently-configured data source. */
export function getAdapter(): StorageAdapter {
  const config = getDataSource();
  if (config.mode === "supabase") return new SupabaseAdapter();
  return new LocalStorageAdapter();
}
