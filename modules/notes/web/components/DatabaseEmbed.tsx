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
import { useDialog } from "@cortex/core";
import { DatabaseBlock } from "./database/DatabaseBlock";

const NEW = "__new__";

function EmbedView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const store = useStoreContext();
  const nav = useNav();
  const dialog = useDialog();
  // Editing reveals the view switcher, filter/sort bar, and new-row button;
  // by default an embed is just a titled table.
  const [editing, setEditing] = useState(false);

  const dbId: string | null = node.attrs.dbId ?? null;
  const db = dbId ? store.getDatabase(dbId) : undefined;

  async function pick() {
    const choice = await dialog.choose("Embed which list?", [
      ...store.databases.map((d) => ({
        label: `▤ ${d.name || "Untitled"}`,
        value: d.id,
      })),
      { label: "＋ create new list", value: NEW },
    ]);
    if (!choice) return;
    updateAttributes({
      dbId: choice === NEW ? store.createDatabase() : choice,
      viewId: null,
    });
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
            {dbId ? "List not found" : "No list selected"}
          </span>
          <span className="db-embed-actions">
            <button className="meta-btn" onClick={pick}>
              Choose list
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
              title="Open list"
              onClick={() => nav.openDatabase(db.id)}
            >
              ▤ {db.name || "Untitled"} ↗
            </button>
            <span className="db-embed-actions">
              <button
                className={`row-btn db-embed-edit${editing ? " active" : ""}`}
                title={editing ? "Done editing" : "Edit view, filters, sort, rows"}
                onClick={() => setEditing((e) => !e)}
              >
                {editing ? "Done" : "Edit"}
              </button>
              {editing && (
                <button
                  className="row-btn"
                  title="Embed a different list"
                  onClick={pick}
                >
                  ⇄
                </button>
              )}
              {editing && (
                <button
                  className="row-btn"
                  title="Remove embed (keeps the list)"
                  onClick={() => deleteNode()}
                >
                  ×
                </button>
              )}
            </span>
          </div>
          <DatabaseBlock
            db={db}
            store={store}
            embedded
            lockSchema
            minimal={!editing}
            viewId={node.attrs.viewId ?? null}
            onSelectView={(id) => updateAttributes({ viewId: id })}
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
      // Which of the database's views this embed shows (view config itself —
      // filters/sort/grouping — lives on the view, shared everywhere).
      viewId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-view-id"),
        renderHTML: (attrs) =>
          attrs.viewId ? { "data-view-id": attrs.viewId } : {},
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
