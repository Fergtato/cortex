import { useState } from "react";
import type { Page } from "../types";
import type { Store } from "../store";
import { useDialog } from "./Dialog";

interface Props {
  store: Store;
  parentId: string | null;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreatedSelect: (id: string) => void;
}

export function PageTree({ store, parentId, depth, selectedId, onSelect, onCreatedSelect }: Props) {
  const pages = store.childrenOf(parentId);

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

function TreeNode({ store, page, depth, selectedId, onSelect, onCreatedSelect }: NodeProps) {
  const [open, setOpen] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useDialog();
  const children = store.childrenOf(page.id);
  const hasChildren = children.length > 0;
  const selected = page.id === selectedId;

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
        className={`tree-row${selected ? " selected" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={() => onSelect(page.id)}
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
        <span className="tree-title">{page.title || "untitled"}</span>
        <span className="tree-actions">
          <button
            className="row-btn"
            title="Add subpage"
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
        <PageTree
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
