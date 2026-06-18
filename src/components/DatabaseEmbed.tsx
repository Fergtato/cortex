import {
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
import { DatabaseBlock } from "./database/DatabaseBlock";

const NEW = "__new__";

function EmbedView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const store = useStoreContext();
  const nav = useNav();
  const dialog = useDialog();

  const dbId: string | null = node.attrs.dbId ?? null;
  const db = dbId ? store.getDatabase(dbId) : undefined;

  async function pick() {
    const choice = await dialog.choose("Embed which database?", [
      ...store.databases.map((d) => ({
        label: `▤ ${d.name || "untitled"}`,
        value: d.id,
      })),
      { label: "＋ create new database", value: NEW },
    ]);
    if (!choice) return;
    updateAttributes({ dbId: choice === NEW ? store.createDatabase() : choice });
  }

  return (
    <NodeViewWrapper
      className="db-embed"
      contentEditable={false}
      // Keep all interaction inside the embed: don't let ProseMirror handle
      // these events (which would steal focus from inputs and hijack typing).
      onMouseDown={(e: ReactMouseEvent) => e.stopPropagation()}
      onKeyDown={(e: ReactKeyboardEvent) => e.stopPropagation()}
    >
      {!db ? (
        <div className="db-embed-empty">
          <span className="db-embed-msg">
            {dbId ? "⚠ database not found" : "▤ no database selected"}
          </span>
          <span className="db-embed-actions">
            <button className="meta-btn" onClick={pick}>
              choose database
            </button>
            <button
              className="row-btn"
              title="Remove embed"
              onClick={() => deleteNode()}
            >
              ×
            </button>
          </span>
        </div>
      ) : (
        <>
          <div className="db-embed-bar">
            <button
              className="db-embed-open"
              title="Open database"
              onClick={() => nav.openDatabase(db.id)}
            >
              ▤ {db.name || "untitled"} ↗
            </button>
            <span className="db-embed-actions">
              <button className="row-btn" title="Embed a different database" onClick={pick}>
                ⇄
              </button>
              <button
                className="row-btn"
                title="Remove embed (keeps the database)"
                onClick={() => deleteNode()}
              >
                ×
              </button>
            </span>
          </div>
          <DatabaseBlock
            db={db}
            store={store}
            embedded
            lockSchema
            filter={node.attrs.filter ?? null}
            sort={node.attrs.sort ?? null}
            onChangeFilter={(f) => updateAttributes({ filter: f })}
            onChangeSort={(s) => updateAttributes({ sort: s })}
          />
        </>
      )}
    </NodeViewWrapper>
  );
}

/** Block node that displays a standalone database inline within a page. */
export const DatabaseEmbed = Node.create({
  name: "databaseEmbed",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      dbId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-db-id"),
        renderHTML: (attrs) => ({ "data-db-id": attrs.dbId }),
      },
      // Per-embed view config, persisted in the page content.
      filter: {
        default: null,
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute("data-filter") || "null");
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) =>
          attrs.filter ? { "data-filter": JSON.stringify(attrs.filter) } : {},
      },
      sort: {
        default: null,
        parseHTML: (el) => {
          try {
            return JSON.parse(el.getAttribute("data-sort") || "null");
          } catch {
            return null;
          }
        },
        renderHTML: (attrs) =>
          attrs.sort ? { "data-sort": JSON.stringify(attrs.sort) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-database-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-database-embed": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmbedView);
  },
});
