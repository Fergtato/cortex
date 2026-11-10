import {
  createContext,
  useContext,
  useState,
  type DragEvent as ReactDragEvent,
} from "react";
import type { Page } from "../types";
import type { Store } from "../store";
import { useDialog } from "./Dialog";
import { Icon } from "./Icon";

type DropZone = "before" | "inside" | "after";

interface DndState {
  draggingId: string | null;
  target: { id: string; zone: DropZone } | null;
  begin: (id: string) => void;
  hover: (id: string, zone: DropZone) => void;
  clear: (id: string) => void;
  end: () => void;
}

const TreeDnd = createContext<DndState | null>(null);

interface Props {
  store: Store;
  parentId: string | null;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreatedSelect: (id: string) => void;
}

export function PageTree(props: Props) {
  // The depth-0 tree owns the shared drag session for the whole recursion.
  const existing = useContext(TreeDnd);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<{ id: string; zone: DropZone } | null>(null);

  if (existing) return <TreeList {...props} />;

  const dnd: DndState = {
    draggingId,
    target,
    begin: (id) => setDraggingId(id),
    hover: (id, zone) => setTarget({ id, zone }),
    clear: (id) => setTarget((t) => (t?.id === id ? null : t)),
    end: () => {
      setDraggingId(null);
      setTarget(null);
    },
  };

  return (
    <TreeDnd.Provider value={dnd}>
      <TreeList {...props} root />
    </TreeDnd.Provider>
  );
}

function TreeList({
  store,
  parentId,
  depth,
  selectedId,
  onSelect,
  onCreatedSelect,
  root,
}: Props & { root?: boolean }) {
  const dnd = useContext(TreeDnd)!;
  const pages = store.childrenOf(parentId);
  const [rootOver, setRootOver] = useState(false);

  return (
    <ul className="tree">
      {pages.map((page) => (
        <TreeNode
          key={page.id}
          store={store}
          page={page}
          depth={depth}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreatedSelect={onCreatedSelect}
        />
      ))}
      {/* Trailing pad at the very top level: drop here to un-nest to root. */}
      {root && dnd.draggingId && (
        <li
          className={`tree-root-pad${rootOver ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setRootOver(true);
          }}
          onDragLeave={() => setRootOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setRootOver(false);
            store.movePage(dnd.draggingId!, null, store.childrenOf(null).length);
            dnd.end();
          }}
        >
          move to top level
        </li>
      )}
    </ul>
  );
}

interface NodeProps {
  store: Store;
  page: Page;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreatedSelect: (id: string) => void;
}

/** True when `targetId` sits inside `ancestorId`'s subtree (or is it). */
function isInSubtree(store: Store, targetId: string, ancestorId: string): boolean {
  let cursor: string | null = targetId;
  while (cursor !== null) {
    if (cursor === ancestorId) return true;
    cursor = store.pages[cursor]?.parentId ?? null;
  }
  return false;
}

function TreeNode({ store, page, depth, selectedId, onSelect, onCreatedSelect }: NodeProps) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useDialog();
  const dnd = useContext(TreeDnd)!;
  const children = store.childrenOf(page.id);
  const hasChildren = children.length > 0;
  const selected = page.id === selectedId;

  const dragging = dnd.draggingId === page.id;
  // A page can't be dropped onto itself or into its own subtree.
  const invalidTarget = dnd.draggingId !== null && isInSubtree(store, page.id, dnd.draggingId);
  const zone = dnd.target?.id === page.id ? dnd.target.zone : null;

  function onDragOver(e: ReactDragEvent) {
    if (!dnd.draggingId || invalidTarget) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.height) return;
    const frac = (e.clientY - rect.top) / rect.height;
    const z: DropZone = frac < 0.3 ? "before" : frac > 0.7 ? "after" : "inside";
    dnd.hover(page.id, z);
  }

  function onDrop(e: ReactDragEvent) {
    e.preventDefault();
    const dragId = dnd.draggingId;
    const z = dnd.target?.id === page.id ? dnd.target.zone : null;
    dnd.end();
    if (!dragId || invalidTarget || !z) return;
    if (z === "inside") {
      store.movePage(dragId, page.id, store.childrenOf(page.id).length);
      setOpen(true); // reveal the newly-nested child
      return;
    }
    const siblings = store.childrenOf(page.parentId);
    let idx = siblings.findIndex((p) => p.id === page.id);
    if (z === "after") idx += 1;
    store.movePage(dragId, page.parentId, idx);
  }

  const menuItems = [
    {
      key: "rename",
      label: "Rename",
      danger: false,
      async action() {
        setMenuOpen(false);
        const name = await dialog.prompt("Rename page:", page.title || "untitled");
        if (name !== null && name.trim() !== "") {
          store.updatePage(page.id, { title: name.trim() });
        }
      },
    },
    {
      key: "delete",
      label: "Delete",
      danger: true,
      async action() {
        setMenuOpen(false);
        const ok = await dialog.confirm(
          `Delete "${page.title || "untitled"}" and all subpages?`,
          { confirmLabel: "delete", danger: true }
        );
        if (ok) store.deletePage(page.id);
      },
    },
  ];

  return (
    <li className="tree-node">
      <div
        className={
          `tree-row${selected ? " selected" : ""}` +
          `${dragging ? " tree-dragging" : ""}` +
          `${zone ? ` drop-${zone}` : ""}`
        }
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        draggable
        onClick={() => onSelect(page.id)}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", page.id);
          dnd.begin(page.id);
        }}
        onDragEnd={() => dnd.end()}
        onDragOver={onDragOver}
        onDragLeave={() => dnd.clear(page.id)}
        onDrop={onDrop}
      >
        <span
          className="tree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((o) => !o);
          }}
        >
          {hasChildren ? (open ? "▼" : "▶") : "·"}
        </span>
        <span className="tree-title">
          {page.icon && (
            <Icon name={page.icon} size={13} color={page.iconColor} className="tree-icon" />
          )}
          {page.title || "untitled"}
        </span>
        <span className="tree-actions">
          <button
            className="row-btn"
            title="Add subpage"
            draggable={false}
            onClick={(e) => {
              e.stopPropagation();
              const id = store.createPage(page.id);
              setOpen(true);
              onCreatedSelect(id);
            }}
          >
            +
          </button>
          <span className="tree-menu-wrap">
            <button
              className="row-btn row-btn-menu"
              title="Page menu"
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
                  onClick={() => setMenuOpen(false)}
                />
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
      </div>
      {hasChildren && open && (
        <TreeList
          store={store}
          parentId={page.id}
          depth={depth + 1}
          selectedId={selectedId}
          onSelect={onSelect}
          onCreatedSelect={onCreatedSelect}
        />
      )}
    </li>
  );
}
