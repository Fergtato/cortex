import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useDialog } from "../Dialog";

function TabsView({ node, updateAttributes, editor, getPos }: NodeViewProps) {
  const dialog = useDialog();
  const count = node.childCount;
  const active = Math.min(node.attrs.active ?? 0, Math.max(0, count - 1));

  const labels: string[] = [];
  node.forEach((child) => labels.push((child.attrs.label as string) || "Tab"));

  // Position of the i-th tab child within the document.
  const childStart = (i: number) => {
    const pos = getPos();
    if (pos == null) return null;
    let p = pos + 1;
    for (let k = 0; k < i; k++) p += node.child(k).nodeSize;
    return p;
  };

  const addTab = () => {
    const pos = getPos();
    if (pos == null) return;
    const end = pos + node.nodeSize - 1;
    editor
      .chain()
      .focus()
      .insertContentAt(end, {
        type: "tab",
        attrs: { label: `Tab ${count + 1}` },
        content: [{ type: "paragraph" }],
      })
      .run();
    updateAttributes({ active: count });
  };

  const removeTab = (i: number) => {
    if (count <= 1) return;
    const from = childStart(i);
    if (from == null) return;
    const size = node.child(i).nodeSize;
    editor.chain().focus().deleteRange({ from, to: from + size }).run();
    updateAttributes({ active: Math.max(0, Math.min(active, count - 2)) });
  };

  const renameTab = async (i: number) => {
    const name = await dialog.prompt("Tab name:", labels[i]);
    if (name == null || name.trim() === "") return;
    const from = childStart(i);
    if (from == null) return;
    const attrs = { ...node.child(i).attrs, label: name.trim() };
    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.setNodeMarkup(from, undefined, attrs);
        return true;
      })
      .run();
  };

  return (
    <NodeViewWrapper className="pt-tabs" data-active={active}>
      <div className="pt-tabs-bar" contentEditable={false}>
        {labels.map((label, i) => (
          <span
            key={i}
            className={`pt-tab-btn${i === active ? " active" : ""}`}
            title="Double-click to rename"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => updateAttributes({ active: i })}
            onDoubleClick={() => renameTab(i)}
          >
            {label}
            {count > 1 && (
              <span
                className="pt-tab-del"
                title="Remove tab"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(i);
                }}
              >
                ×
              </span>
            )}
          </span>
        ))}
        <button
          className="pt-tab-add"
          title="Add tab"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addTab}
        >
          +
        </button>
      </div>
      <NodeViewContent className="pt-tabs-body" />
    </NodeViewWrapper>
  );
}

export const Tabs = Node.create({
  name: "tabs",
  group: "block",
  content: "tab+",
  isolating: true,

  addAttributes() {
    return {
      active: {
        default: 0,
        parseHTML: (el) => parseInt(el.getAttribute("data-active") || "0", 10),
        renderHTML: (attrs) => ({ "data-active": attrs.active }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-tabs]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-tabs": "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabsView);
  },
});

export const Tab = Node.create({
  name: "tab",
  content: "block+",
  isolating: true,

  addAttributes() {
    return {
      label: {
        default: "Tab",
        parseHTML: (el) => el.getAttribute("data-label") || "Tab",
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-tab]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-tab": "", class: "pt-tab" }), 0];
  },
});
