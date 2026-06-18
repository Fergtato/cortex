import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { useSettings } from "./settings";
import { StoreContext, NavContext, type Nav } from "./context";
import { PageTree } from "./components/PageTree";
import { Editor } from "./components/Editor";
import { DatabaseBlock } from "./components/database/DatabaseBlock";
import { SettingsPanel } from "./components/SettingsPanel";
import type { Page } from "./types";

type Selection =
  | { kind: "page"; id: string }
  | { kind: "database"; id: string }
  | null;

export default function App() {
  const store = useStore();
  const settings = useSettings();
  const [sel, setSel] = useState<Selection>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Start collapsed on phones; otherwise honour the saved preference.
    if (typeof window !== "undefined" && window.innerWidth <= 768) return false;
    const saved = localStorage.getItem("project-tracker:sidebar");
    return saved ? saved === "open" : true;
  });

  useEffect(() => {
    localStorage.setItem("project-tracker:sidebar", sidebarOpen ? "open" : "closed");
  }, [sidebarOpen]);

  // On narrow screens the sidebar is an overlay; close it after navigating.
  const closeSidebarOnMobile = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, []);

  const openPage = useCallback(
    (id: string) => {
      setSel({ kind: "page", id });
      closeSidebarOnMobile();
    },
    [closeSidebarOnMobile]
  );
  const openDatabase = useCallback(
    (id: string) => {
      setSel({ kind: "database", id });
      closeSidebarOnMobile();
    },
    [closeSidebarOnMobile]
  );
  const nav: Nav = useMemo(() => ({ openPage, openDatabase }), [openPage, openDatabase]);

  // Keep selection valid: clear it if the selected page/database was deleted.
  useEffect(() => {
    if (!sel) return;
    if (sel.kind === "page" && !store.pages[sel.id]) setSel(null);
    if (sel.kind === "database" && !store.getDatabase(sel.id)) setSel(null);
  }, [sel, store.pages, store]);

  const page =
    sel?.kind === "page" ? store.pages[sel.id] ?? null : null;
  const database =
    sel?.kind === "database" ? store.getDatabase(sel.id) ?? null : null;

  // Breadcrumb trail from root to the selected page.
  const trail = useMemo(() => {
    const out: Page[] = [];
    let cur = page;
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? store.pages[cur.parentId] ?? null : null;
    }
    return out;
  }, [page, store.pages]);

  return (
    <StoreContext.Provider value={store}>
      <NavContext.Provider value={nav}>
        <div className={`app${sidebarOpen ? " sidebar-open" : " sidebar-closed"}`}>
          {sidebarOpen && (
            <div
              className="sidebar-backdrop"
              onClick={() => setSidebarOpen(false)}
            />
          )}
          {!sidebarOpen && (
            <button
              className="sidebar-show-btn"
              title="Show sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              ☰
            </button>
          )}
          <aside className="sidebar">
            <header className="sidebar-head">
              <span className="logo">▚ PROJECT-TRACKER</span>
              <button
                className="sidebar-hide-btn"
                title="Hide sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                «
              </button>
            </header>

            <button
              className="new-project-btn"
              onClick={() => openPage(store.createPage(null, "new project"))}
            >
              [ + new project ]
            </button>

            <nav className="sidebar-tree">
              <div className="sidebar-section-label">pages</div>
              {store.roots.length === 0 ? (
                <p className="empty-hint">no projects yet ↑</p>
              ) : (
                <PageTree
                  store={store}
                  parentId={null}
                  depth={0}
                  selectedId={sel?.kind === "page" ? sel.id : null}
                  onSelect={openPage}
                />
              )}

              <div className="sidebar-section-label db-label">
                databases
                <button
                  className="section-add"
                  title="New database"
                  onClick={() => openDatabase(store.createDatabase())}
                >
                  +
                </button>
              </div>
              {store.databases.length === 0 ? (
                <p className="empty-hint">no databases yet</p>
              ) : (
                <ul className="db-list">
                  {store.databases.map((db) => (
                    <li
                      key={db.id}
                      className={`db-list-row${
                        sel?.kind === "database" && sel.id === db.id ? " selected" : ""
                      }`}
                      onClick={() => openDatabase(db.id)}
                    >
                      <span className="db-list-icon">▤</span>
                      <span className="db-list-name">{db.name || "untitled"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </nav>

            <footer className="sidebar-foot">
              <button className="settings-btn" onClick={() => setSettingsOpen(true)}>
                ⚙ settings
              </button>
              <span className="foot-count">
                {Object.keys(store.pages).length}p · {store.databases.length}db
              </span>
            </footer>
          </aside>

          {settingsOpen && (
            <SettingsPanel {...settings} onClose={() => setSettingsOpen(false)} />
          )}

          <main className="main">
            {page ? (
              <div className="page">
                <div className="breadcrumb">
                  {trail.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && <span className="crumb-sep"> / </span>}
                      <button className="crumb" onClick={() => openPage(p.id)}>
                        {p.title || "untitled"}
                      </button>
                    </span>
                  ))}
                </div>

                <input
                  className="page-title"
                  value={page.title}
                  placeholder="untitled"
                  onChange={(e) => store.updatePage(page.id, { title: e.target.value })}
                />

                <div className="page-meta">
                  <span>updated {new Date(page.updatedAt).toLocaleString()}</span>
                </div>

                <Editor
                  page={page}
                  subpages={store.childrenOf(page.id)}
                  onChangeContent={(html) => store.updatePage(page.id, { content: html })}
                  onCreateSubpage={() => {
                    const id = store.createPage(page.id, "untitled");
                    return { id, title: "untitled" };
                  }}
                  onOpenPage={openPage}
                />
              </div>
            ) : database ? (
              <div className="page">
                <div className="breadcrumb">
                  <span className="crumb-static">databases</span>
                  <span className="crumb-sep"> / </span>
                  <span className="crumb-static">{database.name || "untitled"}</span>
                </div>
                <DatabaseBlock db={database} store={store} />
              </div>
            ) : (
              <div className="placeholder-screen">
                <pre className="ascii">{`
   ┌──────────────────────────────┐
   │  select or create a project  │
   │  or a database to begin      │
   └──────────────────────────────┘
`}</pre>
              </div>
            )}
          </main>
        </div>
      </NavContext.Provider>
    </StoreContext.Provider>
  );
}
