import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useNav, useStoreContext } from "../context";
import { useDialog } from "./Dialog";

function SubpageLinkView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const store = useStoreContext();
  const nav = useNav();
  const dialog = useDialog();
  const [menuOpen, setMenuOpen] = useState(false);

  const pageId: string = node.attrs.pageId;
  const title: string = node.attrs.title || "untitled";

  function onClickLink(e: ReactMouseEvent) {
    e.stopPropagation();
    nav.openPage(pageId);
  }

  function toggleMenu(e: ReactMouseEvent) {
    e.stopPropagation();
    setMenuOpen((o) => !o);
  }

  const menuItems = [
    {
      key: "rename",
      label: "Rename",
      danger: false,
      async action() {
        setMenuOpen(false);
        const name = await dialog.prompt("Rename page:", title);
        if (name !== null && name.trim() !== "") {
          updateAttributes({ title: name.trim() });
          store.updatePage(pageId, { title: name.trim() });
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
          `Delete "${title}" and all subpages?`,
          { confirmLabel: "delete", danger: true }
        );
        if (ok) {
          store.deletePage(pageId);
          deleteNode();
        }
      },
    },
  ];

  return (
    <NodeViewWrapper
      as="span"
      className="subpage-link-inline"
      contentEditable={false}
onMouseDown={(e: ReactMouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onKeyDown={(e: ReactKeyboardEvent) => {
          e.stopPropagation();
          e.nativeEvent.stopPropagation();
        }}
    >
      <span className="sp-link-text" onClick={onClickLink}>
        ▸ {title}
      </span>
      <span className="sp-menu-wrap">
        <button className="sp-menu-btn" onClick={toggleMenu}>
          ···
        </button>
        {menuOpen && (
          <>
<div
                className="sp-menu-backdrop"
                onMouseDown={(e: ReactMouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => setMenuOpen(false)}
              />
            <div className="sp-menu">
{menuItems.map((item) => (
                  <button
                    key={item.key}
                    className={`sp-menu-item${item.danger ? " danger" : ""}`}
                    onMouseDown={(e: ReactMouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={item.action}
                  >
                    {item.label}
                  </button>
                ))}
            </div>
          </>
        )}
      </span>
    </NodeViewWrapper>
  );
}

export const SubpageLink = Node.create({
  name: "subpageLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-page-id"),
        renderHTML: (attrs) => ({ "data-page-id": attrs.pageId }),
      },
      title: {
        default: "untitled",
        parseHTML: (el) => el.getAttribute("data-title") ?? "untitled",
        renderHTML: (attrs) => ({ "data-title": attrs.title }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-subpage-link]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-subpage-link": "",
        class: "subpage-link-inline",
      }),
      `▸ ${node.attrs.title || "untitled"}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SubpageLinkView);
  },
});