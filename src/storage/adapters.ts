import type { DatabaseMap, PageMap } from "../types";
import { getDataSource } from "./datasource";

/**
 * Persistence backend. Both load/save operate on whole collections (maps keyed
 * by id) — matching how the store already thinks about its data — so swapping
 * backends needs no changes to the store's update logic.
 */
export interface StorageAdapter {
  loadPages(): Promise<PageMap>;
  savePages(pages: PageMap): Promise<void>;
  loadDatabases(): Promise<DatabaseMap>;
  saveDatabases(databases: DatabaseMap): Promise<void>;
}

const PAGES_KEY = "project-tracker:pages:v1";
const DB_KEY = "project-tracker:databases:v1";

class LocalStorageAdapter implements StorageAdapter {
  private read<T>(key: string): T {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      /* ignore corrupt storage */
    }
    return {} as T;
  }

  async loadPages() {
    return this.read<PageMap>(PAGES_KEY);
  }
  async savePages(pages: PageMap) {
    localStorage.setItem(PAGES_KEY, JSON.stringify(pages));
  }
  async loadDatabases() {
    return this.read<DatabaseMap>(DB_KEY);
  }
  async saveDatabases(databases: DatabaseMap) {
    localStorage.setItem(DB_KEY, JSON.stringify(databases));
  }
}

class ApiAdapter implements StorageAdapter {
  constructor(private baseUrl: string) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}/api/${path}`;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path));
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  private async put(path: string, body: unknown): Promise<void> {
    const res = await fetch(this.url(path), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  }

  loadPages() {
    return this.get<PageMap>("pages");
  }
  savePages(pages: PageMap) {
    return this.put("pages", pages);
  }
  loadDatabases() {
    return this.get<DatabaseMap>("databases");
  }
  saveDatabases(databases: DatabaseMap) {
    return this.put("databases", databases);
  }
}

/** Builds the adapter for the currently-configured data source. */
export function getAdapter(): StorageAdapter {
  const config = getDataSource();
  if (config.mode === "api") return new ApiAdapter(config.apiUrl);
  return new LocalStorageAdapter();
}
