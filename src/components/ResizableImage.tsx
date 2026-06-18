import { type MouseEvent as ReactMouseEvent } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

export const ASPECTS = ["original", "1:1", "4:3", "16:9"] as const;
type Aspect = (typeof ASPECTS)[number];

const ASPECT_RATIO: Record<Aspect, string | undefined> = {
  original: undefined,
  "1:1": "1 / 1",
  "4:3": "4 / 3",
  "16:9": "16 / 9",
};

function ImageView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const src = node.attrs.src as string;
  const width = node.attrs.width as number;
  const aspect = node.attrs.aspect as Aspect;
  const ratio = ASPECT_RATIO[aspect];

  function startResize(e: ReactMouseEvent) {
    e.preventDefault();
    const wrap = (e.currentTarget as HTMLElement).closest(
      ".rimg-wrap"
    ) as HTMLElement | null;
    const startX = e.clientX;
    const startW = wrap?.offsetWidth ?? width;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(80, Math.round(startW + (ev.clientX - startX)));
      updateAttributes({ width: w });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <NodeViewWrapper
      className="rimg-wrap"
      style={{ width: `${width}px` }}
      contentEditable={false}
    >
      <div className="rimg-box">
        {ratio ? (
          <div className="rimg-frame" style={{ aspectRatio: ratio }}>
            <img src={src} className="rimg rimg-cover" alt="" />
          </div>
        ) : (
          <img src={src} className="rimg" alt="" />
        )}
      </div>

      <div className="rimg-toolbar">
        {ASPECTS.map((a) => (
          <button
            key={a}
            className={`rimg-aspect-btn${aspect === a ? " active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => updateAttributes({ aspect: a })}
          >
            {a}
          </button>
        ))}
        <button
          className="rimg-aspect-btn rimg-del"
          title="Remove image"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => deleteNode()}
        >
          ×
        </button>
      </div>

      <div
        className="rimg-handle"
        title="Drag to resize"
        onMouseDown={startResize}
      />
    </NodeViewWrapper>
  );
}

/** Block image node with drag-to-resize and aspect-ratio cropping. */
export const ResizableImage = Node.create({
  name: "resizableImage",
  group: "block",
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: null },
      width: {
        default: 420,
        parseHTML: (el) => {
          const w = el.getAttribute("data-width");
          return w ? parseInt(w, 10) : 420;
        },
        renderHTML: (attrs) => ({ "data-width": attrs.width }),
      },
      aspect: {
        default: "original",
        parseHTML: (el) => el.getAttribute("data-aspect") || "original",
        renderHTML: (attrs) => ({ "data-aspect": attrs.aspect }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
