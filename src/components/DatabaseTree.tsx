import {
  createContext,
  useContext,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import { isFolder, type Database, type DbItem, type Folder } from "../types";
import type { Store } from "../store";
import { useDialog } from "./Dialog";
import { InlineRename } from "./InlineRename";

type DropZone = "before" | "inside" | "after";

interface DndState {
  draggingId: string | null;
  /** Whether the dragged item is a folder (folders can't be nested). */
  draggingFolder: boolean;
  target: { id: string; zone: DropZone } | null;
  begin: (id: string, isFolder: boolean) => void;
  hover: (id: string, zone: DropZone) => void;
  clear: (id: string) => void;
  end: () => void;
}

const DbDnd = createContext<DndState | null>(null);

interface Props {
  store: Store;
  selectedId: string | null;
  onOpenDatabase: (id: string) => void;
  /** Folder id whose name should open in inline-rename (freshly created). */
  renamingId?: string | null;
  onRenameEnd?: () => void;
}

export function DatabaseTree({
  store,
  selectedId,
  onOpenDatabase,
  renamingId = null,
  onRenameEnd,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingFolder, setDraggingFolder] = useState(false);
  const [target, setTarget] = useState<{ id: string; zone: DropZone } | null>(null);

  const dnd: DndState = {
    draggingId,
    draggingFolder,
    target,
    begin: (id, isF) => {
      setDraggingId(id);
      setDraggingFolder(isF);
    },
    hover: (id, zone) => setTarget({ id, zone }),
    clear: (id) => setTarget((t) => (t?.id === id ? null : t)),
    end: () => {
      setDraggingId(null);
      setTarget(null);
    },
  };

  const items = store.topLevelDbItems;

  if (items.length === 0) {
    return <p className="empty-hint">no databases yet</p>;
  }

  return (
    <DbDnd.Provider value={dnd}>
      <ul className="db-list">
        {items.map((item) =>
          isFolder(item) ? (
            <FolderRow
              key={item.id}
              store={store}
              folder={item}
              selectedId={selectedId}
              onOpenDatabase={onOpenDatabase}
              autoRename={renamingId === item.id}
              onRenameEnd={onRenameEnd}
            />
          ) : (
            <DbRow
              key={item.id}
              store={store}
              db={item}
              selectedId={selectedId}
              onOpenDatabase={onOpenDatabase}
            />
          )
        )}
      </ul>
    </DbDnd.Provider>
  );
}

/** Common before/after drop math for a top-level row. */
function topLevelDrop(store: Store, targetItem: DbItem, zone: "before" | "after", dragId: string) {
  const items = store.topLevelDbItems;
  let idx = items.findIndex((it) => it.id === targetItem.id);
  if (zone === "after") idx += 1;
  store.moveDbItem(dragId, null, idx);
}

function DbRow({
  store,
  db,
  selectedId,
  onOpenDatabase,
  inFolder,
}: {
  store: Store;
  db: Database;
  selectedId: string | null;
  onOpenDatabase: (id: string) => void;
  inFolder?: boolean;
}) {
  const dnd = useContext(DbDnd)!;
  const dialog = useDialog();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const dragging = dnd.draggingId === db.id;
  const zone = dnd.target?.id === db.id ? dnd.target.zone : null;
  // Databases never accept an "inside" drop (no nesting under a database).
  const showZone = zone === "inside" ? null : zone;

  function onDragOver(e: ReactDragEvent) {
    if (!dnd.draggingId || dnd.draggingId === db.id) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.height) return;
    const z: DropZone = (e.clientY - rect.top) / rect.height < 0.5 ? "before" : "after";
    dnd.hover(db.id, z);
  }

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    const dragId = dnd.draggingId;
    const z = dnd.target?.id === db.id ? dnd.target.zone : null;
    dnd.end();
    if (!dragId || dragId === db.id || z === "inside" || !z) return;
    if (inFolder && db.folderId) {
      // Reorder within the same folder.
      const list = store.databasesInFolder(db.folderId);
      let idx = list.findIndex((d) => d.id === db.id);
      if (z === "after") idx += 1;
      store.moveDbItem(dragId, db.folderId, idx);
    } else {
      topLevelDrop(store, db, z, dragId);
    }
  }

  return (
    <li
      className={
        `db-list-row${selectedId === db.id ? " selected" : ""}` +
        `${inFolder ? " db-in-folder" : ""}` +
        `${dragging ? " tree-dragging" : ""}` +
        `${showZone ? ` drop-${showZone}` : ""}`
      }
      draggable={!renaming}
      onClick={() => {
        if (!renaming) onOpenDatabase(db.id);
      }}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", db.id);
        dnd.begin(db.id, false);
      }}
      onDragEnd={() => dnd.end()}
      onDragOver={onDragOver}
      onDragLeave={() => dnd.clear(db.id)}
      onDrop={onDrop}
    >
      <span className="db-list-icon">▤</span>
      {renaming ? (
        <InlineRename
          value={db.name}
          className="db-list-name db-rename-input"
          onCommit={(name) => {
            store.renameDatabase(db.id, name);
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <span
          className="db-list-name"
          title="double-click to rename"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setRenaming(true);
          }}
        >
          {db.name || "untitled"}
        </span>
      )}
      <span className="tree-actions">
        <span className="tree-menu-wrap">
          <button
            className="row-btn row-btn-menu"
            title="Database menu"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <>
              <div
                className="tree-menu-backdrop"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen(false);
                }}
              />
              <div className="tree-menu">
                <button
                  className="tree-menu-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    setRenaming(true);
                  }}
                >
                  Rename
                </button>
                <button
                  className="tree-menu-item danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    const ok = await dialog.confirm(
                      `Delete database "${db.name || "untitled"}"?`,
                      { confirmLabel: "delete", danger: true }
                    );
                    if (ok) store.deleteDatabase(db.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </span>
      </span>
    </li>
  );
}

function FolderRow({
  store,
  folder,
  selectedId,
  onOpenDatabase,
  autoRename = false,
  onRenameEnd,
}: {
  store: Store;
  folder: Folder;
  selectedId: string | null;
  onOpenDatabase: (id: string) => void;
  autoRename?: boolean;
  onRenameEnd?: () => void;
}) {
  const dnd = useContext(DbDnd)!;
  const dialog = useDialog();
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const editing = renaming || autoRename;
  const endRename = () => {
    setRenaming(false);
    onRenameEnd?.();
  };
  const children = store.databasesInFolder(folder.id);
  const dragging = dnd.draggingId === folder.id;
  const zone = dnd.target?.id === folder.id ? dnd.target.zone : null;
  // A folder can't be dropped inside another folder — only databases can nest.
  const allowInside = !dnd.draggingFolder;
  const showZone = zone === "inside" && !allowInside ? null : zone;

  function onDragOver(e: ReactDragEvent) {
    if (!dnd.draggingId || dnd.draggingId === folder.id) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.height) return;
    const frac = (e.clientY - rect.top) / rect.height;
    let z: DropZone = frac < 0.3 ? "before" : frac > 0.7 ? "after" : "inside";
    if (z === "inside" && !allowInside) z = frac < 0.5 ? "before" : "after";
    dnd.hover(folder.id, z);
  }

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    const dragId = dnd.draggingId;
    const z = dnd.target?.id === folder.id ? dnd.target.zone : null;
    dnd.end();
    if (!dragId || dragId === folder.id || !z) return;
    if (z === "inside") {
      if (!allowInside) return;
      store.moveDbItem(dragId, folder.id, store.databasesInFolder(folder.id).length);
      setOpen(true);
      return;
    }
    topLevelDrop(store, folder, z, dragId);
  }

  const menuItems = [
    {
      key: "rename",
      label: "Rename",
      danger: false,
      async action() {
        setMenuOpen(false);
        setRenaming(true);
      },
    },
    {
      key: "delete",
      label: "Delete",
      danger: true,
      async action() {
        setMenuOpen(false);
        const ok = await dialog.confirm(
          children.length
            ? `Delete folder "${folder.name}"? Its ${children.length} database${
                children.length === 1 ? "" : "s"
              } will move back to the top level.`
            : `Delete folder "${folder.name}"?`,
          { confirmLabel: "delete", danger: true }
        );
        if (ok) store.deleteFolder(folder.id);
      },
    },
  ];

  return (
    <>
      <li
        className={
          `db-list-row db-folder-row${dragging ? " tree-dragging" : ""}` +
          `${showZone ? ` drop-${showZone}` : ""}`
        }
        draggable={!editing}
        onClick={() => {
          if (!editing) setOpen((o) => !o);
        }}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", folder.id);
          dnd.begin(folder.id, true);
        }}
        onDragEnd={() => dnd.end()}
        onDragOver={onDragOver}
        onDragLeave={() => dnd.clear(folder.id)}
        onDrop={onDrop}
      >
        <span className="tree-toggle db-folder-toggle">{open ? "▼" : "▶"}</span>
        {editing ? (
          <InlineRename
            value={folder.name}
            className="db-list-name db-rename-input"
            onCommit={(name) => {
              store.renameFolder(folder.id, name);
              endRename();
            }}
            onCancel={endRename}
          />
        ) : (
          <span
            className="db-list-name"
            title="double-click to rename"
            onDoubleClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
            }}
          >
            {folder.name}
          </span>
        )}
        <span className="tree-actions">
          <span className="tree-menu-wrap">
            <button
              className="row-btn row-btn-menu"
              title="Folder menu"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="tree-menu-backdrop" onClick={() => setMenuOpen(false)} />
                <div className="tree-menu">
                  {menuItems.map((item) => (
                    <button
                      key={item.key}
                      className={`tree-menu-item${item.danger ? " danger" : ""}`}
                      onClick={item.action}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </span>
        </span>
      </li>
      {open &&
        children.map((db) => (
          <DbRow
            key={db.id}
            store={store}
            db={db}
            selectedId={selectedId}
            onOpenDatabase={onOpenDatabase}
            inFolder
          />
        ))}
      {open && children.length === 0 && (
        <li className="db-folder-empty">empty — drop a database here</li>
      )}
    </>
  );
}
