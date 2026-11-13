import type { ModuleBackup } from "@cortex/core";
import { useStoreContext } from "./context";
import { isDatabase, type DatabaseMap, type PageMap } from "./types";

interface NotesBackup {
  pages: PageMap;
  databases: DatabaseMap;
}

const count = (d: Partial<NotesBackup> | undefined) => ({
  pages: Object.keys(d?.pages ?? {}).length,
  databases: Object.values(d?.databases ?? {}).filter(isDatabase).length,
});

/** Notes in Settings → Backup: pages and databases (with folders). */
export const notesBackup: ModuleBackup = {
  useBackup: () => {
    const store = useStoreContext();
    const c = count(store.snapshot());
    return {
      ready: store.loaded,
      summary: `${c.pages} pages · ${c.databases} lists`,
      exportData: () => store.snapshot(),
      importData: (data, mode) => {
        const d = data as Partial<NotesBackup>;
        const cur = store.snapshot();
        store.replaceAll(
          mode === "replace"
            ? { pages: d.pages ?? {}, databases: d.databases ?? {} }
            : { pages: { ...cur.pages, ...d.pages }, databases: { ...cur.databases, ...d.databases } },
        );
      },
    };
  },
  fromV0: (raw) =>
    raw.pages || raw.databases ? { pages: (raw.pages ?? {}) as PageMap, databases: (raw.databases ?? {}) as DatabaseMap } : undefined,
  describe: (data) => {
    const c = count(data as Partial<NotesBackup>);
    return `${c.pages} pages · ${c.databases} lists`;
  },
};
