import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PageFrame, StoredImg, useDialog, useRouter, type ModuleViewProps } from "@cortex/core";
import { Button, Sidebar } from "@cortex/ui";
import "./notes.css";
import { useStoreContext } from "./context";
import type { Page } from "./types";
import { buildPath, buildRouteTable, parsePath, selectionTitle, type Selection } from "./lib/routes";
import { importFromCSV, importFromJSON } from "./lib/importDB";
import { pickImage } from "./lib/image";
import { PageTree } from "./components/PageTree";
import { DatabaseTree } from "./components/DatabaseTree";
import { Editor } from "./components/Editor";
import { DatabaseBlock } from "./components/database/DatabaseBlock";
import { Icon, isIconName } from "./components/Icon";
import { IconPicker } from "./components/IconPicker";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { BASE, LastSelection } from "./selection";

/*
 * Notes views (sidebar + pages + databases). Loaded on demand: this file pulls
 * in Tiptap and the full icon set, which only Notes needs.
 */

/** Route data (path ↔ entity) for the current store contents. */
function useRoutes() {
  const store = useStoreContext();
  const data = store.snapshot();
  const table = useMemo(() => buildRouteTable(data), [data]);
  return { data, table };
}

/**
 * Current selection, read from the URL. Paths are built from names, so a
 * rename makes the current path stale for a moment: if it no longer
 * resolves but the last selected item still exists, keep that item (the page
 * then rewrites the address bar to its new path).
 */
function useSelection(subpath: string): Selection {
  const store = useStoreContext();
  const { data, table } = useRoutes();
  const last = useContext(LastSelection);
  return useMemo(() => {
    if (subpath === "/") return (last.current = null);
    const hit = parsePath(subpath, data, table);
    if (hit) return (last.current = hit);
    const prev = last.current;
    if (prev && (prev.kind === "page" ? store.pages[prev.id] : store.getDatabase(prev.id))) return prev;
    return null;
  }, [subpath, data, table, last, store]);
}

/**
 * Opens an item once it has a route. A just-created page or database isn't in
 * the route table until the store re-renders, so navigation waits for it.
 */
function useOpenWhenRouted(): (s: Selection) => void {
  const { navigate } = useRouter();
  const { table } = useRoutes();
  const [pending, setPending] = useState<Selection>(null);
  useEffect(() => {
    if (pending && table.pathOf.has(`${pending.kind}:${pending.id}`)) {
      navigate(BASE + buildPath(pending, table));
      setPending(null);
    }
  }, [pending, table, navigate]);
  return setPending;
}

function SectionHead({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="notes-side-head">
      <span className="cx-label">{label}</span>
      <span className="notes-side-actions">{children}</span>
    </div>
  );
}

export function NotesSidebar({ subpath }: ModuleViewProps) {
  const store = useStoreContext();
  const { navigate } = useRouter();
  const dialog = useDialog();
  const sel = useSelection(subpath);
  const { table } = useRoutes();
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const open = (s: Selection) => navigate(BASE + buildPath(s, table));

  const setPending = useOpenWhenRouted();

  const handleImport = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    const baseName = file.name.replace(/\.[^.]+$/, "");
    try {
      const text = await file.text();
      const data = ext === "json" ? importFromJSON(text) : ext === "csv" ? importFromCSV(text, baseName) : null;
      if (!data) {
        await dialog.confirm(`Couldn't import "${file.name}". Use a .json or .csv file exported from Cortex.`, { confirmLabel: "OK" });
        return;
      }
      const id = store.createDatabase();
      store.updateDatabase(id, (db) => ({ ...db, name: data.name, properties: data.properties, rows: data.rows, nextSeq: data.rows.length + 1 }));
      setPending({ kind: "database", id });
    } catch (err) {
      await dialog.confirm(`Import failed: ${String(err)}`, { confirmLabel: "OK" });
    }
  };

  return (
    <Sidebar
      title="Notes"
      className="notes-side"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          aria-label="New page"
          title="New page"
          onClick={() => setPending({ kind: "page", id: store.createPage(null, "Untitled") })}
        />
      }
      footer={
        <span className="notes-side-count">
          {Object.keys(store.pages).length} pages · {store.databases.length} lists
        </span>
      }
    >
      <SectionHead label="Pages">
        <Button size="sm" variant="ghost" icon="plus" aria-label="New page" onClick={() => setPending({ kind: "page", id: store.createPage(null, "Untitled") })} />
      </SectionHead>
      {!store.loaded ? null : store.roots.length === 0 ? (
        <p className="notes-side-empty">No pages yet.</p>
      ) : (
        <PageTree
          store={store}
          parentId={null}
          depth={0}
          selectedId={sel?.kind === "page" ? sel.id : null}
          onSelect={(id) => open({ kind: "page", id })}
          onCreatedSelect={(id) => setPending({ kind: "page", id })}
        />
      )}

      <SectionHead label="Lists">
        <Button size="sm" variant="ghost" icon="plus" aria-label="New list" title="New list" onClick={() => setPending({ kind: "database", id: store.createDatabase() })} />
        <Button size="sm" variant="ghost" icon="archive" aria-label="New folder" title="New folder" onClick={() => setRenamingFolderId(store.createFolder())} />
        <Button size="sm" variant="ghost" icon="arrow-down" aria-label="Import list" title="Import list (.json or .csv)" onClick={() => importRef.current?.click()} />
        <input
          ref={importRef}
          type="file"
          accept=".json,.csv,application/json,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void handleImport(f);
          }}
        />
      </SectionHead>
      <DatabaseTree
        store={store}
        selectedId={sel?.kind === "database" ? sel.id : null}
        onOpenDatabase={(id) => open({ kind: "database", id })}
        renamingId={renamingFolderId}
        onRenameEnd={() => setRenamingFolderId(null)}
      />
    </Sidebar>
  );
}

export function NotesPage({ subpath }: ModuleViewProps) {
  const store = useStoreContext();
  const { navigate } = useRouter();
  const { data, table } = useRoutes();
  const sel = useSelection(subpath);
  const openWhenRouted = useOpenWhenRouted();

  // Renames and moves change an item's path: rewrite the address bar in place.
  const canonical = sel ? buildPath(sel, table) : null;
  useEffect(() => {
    if (canonical && canonical !== subpath) navigate(BASE + canonical, { replace: true });
  }, [canonical, subpath, navigate]);

  const docTitle = selectionTitle(sel, data);
  useEffect(() => {
    document.title = docTitle ? `${docTitle} · Cortex` : "Notes · Cortex";
    return () => {
      document.title = "Cortex";
    };
  }, [docTitle]);

  if (store.loadError) {
    return (
      <PageFrame crumbs={["Notes"]} title="Couldn't load notes" subtitle={store.loadError}>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </PageFrame>
    );
  }
  if (!store.loaded) return <PageFrame crumbs={["Notes"]} />;

  const page = sel?.kind === "page" ? store.pages[sel.id] : undefined;
  const database = sel?.kind === "database" ? store.getDatabase(sel.id) : undefined;

  if (page) return <PageView page={page} />;
  if (database) {
    return (
      <PageFrame crumbs={["Notes", "Lists", database.name || "Untitled"]}>
        <div className="notes-root notes-db-page">
          <ErrorBoundary>
            <DatabaseBlock db={database} store={store} />
          </ErrorBoundary>
        </div>
      </PageFrame>
    );
  }
  return (
    <PageFrame
      crumbs={["Notes"]}
      title={subpath === "/" ? "Notes" : "Not found"}
      subtitle={subpath === "/" ? "Pick a page or list in the sidebar, or start a new one." : "This page or list doesn't exist. It may have been renamed or deleted."}
    >
      <div className="notes-empty-actions">
        {subpath === "/" ? (
          <Button variant="primary" icon="plus" onClick={() => openWhenRouted({ kind: "page", id: store.createPage(null, "Untitled") })}>
            New page
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => navigate(BASE)}>
            Back to Notes
          </Button>
        )}
      </div>
    </PageFrame>
  );
}

function PageView({ page }: { page: Page }) {
  const store = useStoreContext();
  const { navigate } = useRouter();
  const { table } = useRoutes();
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const justCreated = useRef(false);
  const openPage = (id: string) => navigate(BASE + buildPath({ kind: "page", id }, table));

  // A freshly created page opens with its title selected, ready to type.
  useEffect(() => {
    if (justCreated.current || page.title === "Untitled") {
      justCreated.current = false;
      if (Date.now() - page.createdAt < 3000) {
        titleRef.current?.focus();
        titleRef.current?.select();
      }
    }
  }, [page.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const trail = useMemo(() => {
    const out: Page[] = [];
    let cur: Page | undefined = page;
    while (cur) {
      out.unshift(cur);
      cur = cur.parentId ? store.pages[cur.parentId] : undefined;
    }
    return out;
  }, [page, store.pages]);

  const crumbs = [
    "Notes",
    ...trail.map((p, i) =>
      i === trail.length - 1 ? (
        p.title || "Untitled"
      ) : (
        <button key={p.id} type="button" className="notes-crumb" onClick={() => openPage(p.id)}>
          {p.title || "Untitled"}
        </button>
      ),
    ),
  ];

  const setCover = async () => {
    const src = await pickImage();
    if (src) store.updatePage(page.id, { cover: src });
  };

  return (
    <PageFrame crumbs={crumbs}>
      <div className={`notes-root page${page.fullWidth ? " page--wide" : ""}`}>
        {page.cover && (
          <div className="page-cover">
            <StoredImg src={page.cover} alt="" />
            <span className="page-cover-actions">
              <Button size="sm" variant="secondary" onClick={setCover}>
                Change cover
              </Button>
              <Button size="sm" variant="secondary" onClick={() => store.updatePage(page.id, { cover: undefined })}>
                Remove
              </Button>
            </span>
          </div>
        )}

        <div className="page-title-row">
          {isIconName(page.icon) && (
            <button className="page-icon" title="Change icon" onClick={() => setIconPickerOpen(true)}>
              <Icon name={page.icon} size={26} color={page.iconColor} />
            </button>
          )}
          <input
            ref={titleRef}
            className="page-title"
            value={page.title}
            placeholder="Untitled"
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
          <span>Edited {new Date(page.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>
          {!isIconName(page.icon) && (
            <Button size="sm" variant="ghost" onClick={() => setIconPickerOpen(true)}>
              Add icon
            </Button>
          )}
          {!page.cover && (
            <Button size="sm" variant="ghost" onClick={setCover}>
              Add cover
            </Button>
          )}
          <Button size="sm" variant="ghost" aria-pressed={!!page.fullWidth} onClick={() => store.updatePage(page.id, { fullWidth: !page.fullWidth })}>
            {page.fullWidth ? "Narrow width" : "Full width"}
          </Button>
        </div>

        <ErrorBoundary>
          <Editor
            page={page}
            subpages={store.childrenOf(page.id)}
            onChangeContent={(html) => store.updatePage(page.id, { content: html })}
            onCreateSubpage={() => {
              const id = store.createPage(page.id, "Untitled");
              return { id, title: "Untitled" };
            }}
            onCreatedNavigate={() => {
              justCreated.current = true;
            }}
            onOpenPage={openPage}
          />
        </ErrorBoundary>
      </div>
    </PageFrame>
  );
}

