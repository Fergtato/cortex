import type { Database, DatabaseMap, Page, PageMap } from "../types";
import { getDataSource } from "./datasource";

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
  saveDatabases(delta: CollectionDelta<Database>): Promise<void>;
}

const PAGES_KEY = "cortex:pages:v1";
const DB_KEY = "cortex:databases:v1";

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
    return this.read<Database>(DB_KEY) as DatabaseMap;
  }
  async saveDatabases(delta: CollectionDelta<Database>) {
    this.applyDelta(DB_KEY, delta);
  }
}

class ApiAdapter implements StorageAdapter {
  constructor(private baseUrl: string, private token?: string) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}/api/${path}`;
  }

  private headers(json = false): HeadersInit {
    return {
      ...(json ? { "Content-Type": "application/json" } : {}),
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), { headers: this.headers() });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  private async patch(path: string, body: unknown): Promise<void> {
    const res = await fetch(this.url(path), {
      method: "PATCH",
      headers: this.headers(true),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  }

  loadPages() {
    return this.get<PageMap>("pages");
  }
  savePages(delta: CollectionDelta<Page>) {
    return this.patch("pages", delta);
  }
  loadDatabases() {
    return this.get<DatabaseMap>("databases");
  }
  saveDatabases(delta: CollectionDelta<Database>) {
    return this.patch("databases", delta);
  }
}

/** Builds the adapter for the currently-configured data source. */
export function getAdapter(): StorageAdapter {
  const config = getDataSource();
  if (config.mode === "api") return new ApiAdapter(config.apiUrl, config.apiToken);
  return new LocalStorageAdapter();
}
