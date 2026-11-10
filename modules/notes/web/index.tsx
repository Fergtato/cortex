import { lazy, Suspense, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { PageFrame, useRouter, type CortexModule, type ModuleViewProps } from "@cortex/core";
import { NavContext, StoreContext, type Nav } from "./context";
import { useStore } from "./store";
import { buildPath, buildRouteTable, type Selection } from "./lib/routes";
import { BASE, LastSelection } from "./selection";
import { NOTES_WIDGETS } from "./widgets";
import { notesBackup } from "./backup";

/*
 * Notes: pages (rich-text, nestable) and databases (six views, formulas,
 * filters), ported from Cortex v0. The store lives in a module Provider so it
 * stays loaded while you use other apps, and so Home widgets can read it. The
 * views (editor, icon set) are code-split and load on first visit.
 */

const views = () => import("./views");
const LazySidebar = lazy(() => views().then((m) => ({ default: m.NotesSidebar })));
const LazyPage = lazy(() => views().then((m) => ({ default: m.NotesPage })));

function withSuspense<P extends object>(C: ComponentType<P>, fallback: ReactNode = null) {
  return (props: P) => (
    <Suspense fallback={fallback}>
      <C {...props} />
    </Suspense>
  );
}

const NotesSidebar = withSuspense<ModuleViewProps>(LazySidebar, <aside className="cx-side" />);
const NotesPage = withSuspense<ModuleViewProps>(LazyPage, <PageFrame crumbs={["Notes"]} />);

function NotesProvider({ children }: { children: ReactNode }) {
  const store = useStore();
  const { navigate } = useRouter();
  // Latest route table without re-creating `nav` (and re-rendering every consumer) on each edit.
  const data = store.snapshot();
  const table = useMemo(() => buildRouteTable(data), [data]);
  const tableRef = useRef(table);
  tableRef.current = table;

  const nav: Nav = useMemo(
    () => ({
      openPage: (id) => navigate(BASE + buildPath({ kind: "page", id }, tableRef.current)),
      openDatabase: (id) => navigate(BASE + buildPath({ kind: "database", id }, tableRef.current)),
    }),
    [navigate],
  );

  const lastSelection = useRef<Selection>(null);

  return (
    <StoreContext.Provider value={store}>
      <NavContext.Provider value={nav}>
        <LastSelection.Provider value={lastSelection}>{children}</LastSelection.Provider>
      </NavContext.Provider>
    </StoreContext.Provider>
  );
}

export const notesModule: CortexModule = {
  id: "notes",
  name: "Notes",
  icon: "note",
  Provider: NotesProvider,
  Sidebar: NotesSidebar,
  Page: NotesPage,
  widgets: NOTES_WIDGETS,
  backup: notesBackup,
};

// Re-exported for Home widgets (Phase 3).
export { useStoreContext as useNotesStore } from "./context";
