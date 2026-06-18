import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

function ToggleView({ node, updateAttributes }: NodeViewProps) {
  const open = node.attrs.open as boolean;
  return (
    <NodeViewWrapper className="pt-toggle" data-open={open ? "true" : "false"}>
      <button
        className="pt-toggle-arrow"
        contentEditable={false}
        title={open ? "Collapse" : "Expand"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => updateAttributes({ open: !open })}
      >
        {open ? "▼" : "▶"}
      </button>
      <NodeViewContent className="pt-toggle-body" />
    </NodeViewWrapper>
  );
}

/**
 * A toggle list: the first child block is the always-visible title; the rest
 * are shown/hidden by the arrow. Collapsing is done purely in CSS off the
 * `data-open` attribute, so it needs only one content hole.
 */
export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      open: {
        default: true,
        parseHTML: (el) => el.getAttribute("data-open") !== "false",
        renderHTML: (attrs) => ({ "data-open": attrs.open ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-toggle]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle": "" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  },
});
