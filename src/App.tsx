import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store";
import { useSettings } from "./settings";
import { StoreContext, NavContext, type Nav } from "./context";
import { PageTree } from "./components/PageTree";
import { DatabaseTree } from "./components/DatabaseTree";
import { DashboardTree } from "./components/DashboardTree";
import { Editor } from "./components/Editor";
import { DatabaseBlock } from "./components/database/DatabaseBlock";
import { DashboardView } from "./components/dashboard/DashboardView";
import { SettingsPanel } from "./components/SettingsPanel";
import { useDialog } from "./components/Dialog";
import { Icon, isIconName } from "./components/Icon";
import { IconPicker } from "./components/IconPicker";
import { importFromCSV, importFromJSON } from "./lib/importDB";
import { pickImage } from "./lib/image";
import type { Page } from "./types";

type Selection =
  | { kind: "page"; id: string }
  | { kind: "database"; id: string }
  | { kind: "dashboard"; id: string }
  | null;

export default function App() {
  const store = useStore();
  const settings = useSettings();
  const [sel, setSel] = useState<Selection>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  // Freshly-created sidebar items whose names open in inline-rename.
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingDashItemId, setRenamingDashItemId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    // Start collapsed on phones; otherwise honour the saved preference.
    if (typeof window !== "undefined" && window.innerWidth <= 768) return false;
    const saved = localStorage.getItem("cortex:sidebar");
    return saved ? saved === "open" : true;
  });

  useEffect(() => {
    localStorage.setItem("cortex:sidebar", sidebarOpen ? "open" : "closed");
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
  const openDashboard = useCallback(
    (id: string) => {
      setSel({ kind: "dashboard", id });
      closeSidebarOnMobile();
    },
    [closeSidebarOnMobile]
  );

  const justCreated = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const dialog = useDialog();

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase();
      const baseName = file.name.replace(/\.[^.]+$/, "");
      try {
        const text = await file.text();
        const data =
          ext === "json"
            ? importFromJSON(text)
            : ext === "csv"
            ? importFromCSV(text, baseName)
            : null;
        if (!data) {
          await dialog.confirm(
            `Could not import "${file.name}". Use a .json or .csv file exported from Cortex or matching the expected structure.`,
            { confirmLabel: "ok" }
          );
          return;
        }
        const id = store.createDatabase();
        store.updateDatabase(id, (db) => ({
          ...db,
          name: data.name,
          properties: data.properties,
          rows: data.rows,
          nextSeq: data.rows.length + 1,
        }));
        openDatabase(id);
      } catch (err) {
        console.error("[cortex] import failed:", err);
        await dialog.confirm(`Import failed: ${String(err)}`, { confirmLabel: "ok" });
      }
    },
    [store, openDatabase, dialog]
  );

  const navigateToNew = useCallback(
    (id: string) => {
      justCreated.current = true;
      openPage(id);
    },
    [openPage]
  );

  const page =
    sel?.kind === "page" ? store.pages[sel.id] ?? null : null;
  const database =
    sel?.kind === "database" ? store.getDatabase(sel.id) ?? null : null;
  const dashboard =
    sel?.kind === "dashboard" ? store.getDashboard(sel.id) ?? null : null;

  useEffect(() => {
    if (justCreated.current) {
      justCreated.current = false;
      titleRef.current?.focus();
      titleRef.current?.select();
    }
  }, [page?.id]);

  const nav: Nav = useMemo(
    () => ({ openPage, openDatabase, openDashboard }),
    [openPage, openDatabase, openDashboard]
  );

  // Keep selection valid: clear it if the selected item was deleted.
  useEffect(() => {
    if (!sel) return;
    if (sel.kind === "page" && !store.pages[sel.id]) setSel(null);
    if (sel.kind === "database" && !store.getDatabase(sel.id)) setSel(null);
    if (sel.kind === "dashboard" && !store.getDashboard(sel.id)) setSel(null);
  }, [sel, store.pages, store]);

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
              <span className="logo">▚ CORTEX</span>
              <button
                className="sidebar-hide-btn"
                title="Hide sidebar"
                onClick={() => setSidebarOpen(false)}
              >
                «
              </button>
            </header>

            <nav className="sidebar-tree">
              <div className="sidebar-section-label db-label">
                <span>dashboards</span>
                <span className="db-section-actions">
                  <button
                    className="section-add"
                    title="New dashboard"
                    onClick={() => {
                      const id = store.createDashboard();
                      openDashboard(id);
                      setRenamingDashItemId(id);
                    }}
                  >
                    +
                  </button>
                  <button
                    className="section-add"
                    title="New folder"
                    onClick={() => setRenamingDashItemId(store.createDashFolder())}
                  >
                    ⊞
                  </button>
                </span>
              </div>
              <DashboardTree
                store={store}
                selectedId={sel?.kind === "dashboard" ? sel.id : null}
                onOpenDashboard={openDashboard}
                renamingId={renamingDashItemId}
                onRenameEnd={() => setRenamingDashItemId(null)}
              />

              <div className="sidebar-section-label db-label">
                <span>pages</span>
                <span className="db-section-actions">
                  <button
                    className="section-add"
                    title="New page"
                    onClick={() => navigateToNew(store.createPage(null, "new project"))}
                  >
                    +
                  </button>
                </span>
              </div>
              {store.roots.length === 0 ? (
                <p className="empty-hint">no projects yet ↑</p>
              ) : (
                <PageTree
                  store={store}
                  parentId={null}
                  depth={0}
                  selectedId={sel?.kind === "page" ? sel.id : null}
                  onSelect={openPage}
                  onCreatedSelect={navigateToNew}
                />
              )}

              <div className="sidebar-section-label db-label">
                <span>databases</span>
                <span className="db-section-actions">
                  <button
                    className="section-add"
                    title="New database"
                    onClick={() => openDatabase(store.createDatabase())}
                  >
                    +
                  </button>
                  <button
                    className="section-add"
                    title="New folder"
                    onClick={() => setRenamingFolderId(store.createFolder())}
                  >
                    ⊞
                  </button>
                  <button
                    className="section-add section-import"
                    title="Import database (.json or .csv)"
                    onClick={() => importInputRef.current?.click()}
                  >
                    ↥
                  </button>
                </span>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,.csv,application/json,text/csv"
                  style={{ display: "none" }}
                  onChange={handleImport}
                />
              </div>
              <DatabaseTree
                store={store}
                selectedId={sel?.kind === "database" ? sel.id : null}
                onOpenDatabase={openDatabase}
                renamingId={renamingFolderId}
                onRenameEnd={() => setRenamingFolderId(null)}
              />
            </nav>

            <footer className="sidebar-foot">
              <button className="settings-btn" onClick={() => setSettingsOpen(true)}>
                ⚙ settings
              </button>
              <span className="foot-count">
                {Object.keys(store.pages).length}p · {store.databases.length}db ·{" "}
                {store.dashboards.length}dash
              </span>
            </footer>
          </aside>

          {settingsOpen && (
            <SettingsPanel {...settings} onClose={() => setSettingsOpen(false)} />
          )}

          <main className="main">
            {page ? (
              <div className="page">
                {page.cover && (
                  <div className="page-cover">
                    <img src={page.cover} alt="" />
                    <span className="page-cover-actions">
                      <button
                        className="meta-btn"
                        onClick={async () => {
                          const src = await pickImage();
                          if (src) store.updatePage(page.id, { cover: src });
                        }}
                      >
                        change
                      </button>
                      <button
                        className="meta-btn"
                        onClick={() => store.updatePage(page.id, { cover: undefined })}
                      >
                        × remove
                      </button>
                    </span>
                  </div>
                )}

                <div className="breadcrumb">
                  {trail.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && <span className="crumb-sep"> / </span>}
                      <button className="crumb" onClick={() => openPage(p.id)}>
                        {p.icon && <Icon name={p.icon} size={12} color={p.iconColor} />}
                        {p.title || "untitled"}
                      </button>
                    </span>
                  ))}
                </div>

                <div className="page-title-row">
                  {isIconName(page.icon) && (
                    <button
                      className="page-icon"
                      title="Change icon"
                      onClick={() => setIconPickerOpen(true)}
                    >
                      <Icon name={page.icon} size={26} color={page.iconColor} />
                    </button>
                  )}
                  <input
                    ref={titleRef}
                    className="page-title"
                    value={page.title}
                    placeholder="untitled"
                    onChange={(e) => store.updatePage(page.id, { title: e.target.value })}
                  />
                </div>
                {iconPickerOpen && (
                  <div className="icon-picker-anchor">
                    <IconPicker
                      current={page.icon}
                      currentColor={page.iconColor}
                      onPick={(icon) => store.updatePage(page.id, { icon })}
                      onPickColor={(iconColor) => store.updatePage(page.id, { iconColor })}
                      onClose={() => setIconPickerOpen(false)}
                    />
                  </div>
                )}

                <div className="page-meta">
                  <span>updated {new Date(page.updatedAt).toLocaleString()}</span>
                  {!isIconName(page.icon) && (
                    <button className="meta-btn" onClick={() => setIconPickerOpen(true)}>
                      <Icon name="sparkles" size={11} /> add icon
                    </button>
                  )}
                  {!page.cover && (
                    <button
                      className="meta-btn"
                      onClick={async () => {
                        const src = await pickImage();
                        if (src) store.updatePage(page.id, { cover: src });
                      }}
                    >
                      ▣ add cover
                    </button>
                  )}
                </div>

                <Editor
                  page={page}
                  subpages={store.childrenOf(page.id)}
                  onChangeContent={(html) => store.updatePage(page.id, { content: html })}
                  onCreateSubpage={() => {
                    const id = store.createPage(page.id, "untitled");
                    return { id, title: "untitled" };
                  }}
                  onCreatedNavigate={() => { justCreated.current = true; }}
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
            ) : dashboard ? (
              <DashboardView dash={dashboard} store={store} />
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
