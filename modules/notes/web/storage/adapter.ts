import { api } from "@cortex/core";
import type { DatabaseMap, DbItem, Page, PageMap } from "../types";

/**
 * An incremental change to a collection: entities to upsert (keyed by id) and
 * ids to delete. The store computes this by diffing against the last-saved
 * snapshot, so an edit sends only the entity that changed.
 */
export interface CollectionDelta<T> {
  upserts: Record<string, T>;
  deletes: string[];
}

/** Notes persistence: the Notes server module (`modules/notes/server`). */
export const notesAdapter = {
  load: () => api<{ pages: PageMap; databases: DatabaseMap }>("/notes"),
  savePages: (delta: CollectionDelta<Page>) =>
    api<void>("/notes/sync", { method: "POST", json: { pages: delta } }),
  saveDatabases: (delta: CollectionDelta<DbItem>) =>
    api<void>("/notes/sync", { method: "POST", json: { databases: delta } }),
};
