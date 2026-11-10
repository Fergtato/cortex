import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

const MIN = 2;
const MAX = 5;

function ColumnsView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const borders = node.attrs.borders as boolean;
  const count = node.childCount;

  const addColumn = () => {
    if (count >= MAX) return;
    const pos = getPos();
    if (pos == null) return;
    const end = pos + node.nodeSize - 1; // just inside the closing token
    editor
      .chain()
      .focus()
      .insertContentAt(end, { type: "column", content: [{ type: "paragraph" }] })
      .run();
  };

  const removeColumn = () => {
    if (count <= MIN) return;
    const pos = getPos();
    if (pos == null) return;
    // Move the last column's content into the previous column, then delete it.
    let childPos = pos + 1;
    for (let i = 0; i < count - 1; i++) childPos += node.child(i).nodeSize;
    const last = node.child(count - 1);
    editor
      .chain()
      .focus()
      .deleteRange({ from: childPos, to: childPos + last.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper className="pt-columns" data-borders={borders ? "true" : "false"}>
      <div className="pt-columns-controls" contentEditable={false}>
        <button
          className="pt-col-btn"
          title="Add column"
          disabled={count >= MAX}
          onMouseDown={(e) => e.preventDefault()}
          onClick={addColumn}
        >
          + col
        </button>
        <button
          className="pt-col-btn"
          title="Remove last column"
          disabled={count <= MIN}
          onMouseDown={(e) => e.preventDefault()}
          onClick={removeColumn}
        >
          − col
        </button>
        <button
          className="pt-col-btn"
          title="Toggle borders"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => updateAttributes({ borders: !borders })}
        >
          {borders ? "borders on" : "borders off"}
        </button>
        <span className="pt-col-count">{count} cols</span>
      </div>
      <NodeViewContent className="pt-columns-row" />
    </NodeViewWrapper>
  );
}

export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column{2,5}",
  isolating: true,

  addAttributes() {
    return {
      borders: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-borders") === "true",
        renderHTML: (attrs) => ({ "data-borders": attrs.borders ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-columns]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-columns": "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnsView);
  },
});

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-column]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-column": "", class: "pt-column" }), 0];
  },
});
