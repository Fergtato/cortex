import { Node, mergeAttributes } from "@tiptap/core";

/**
 * An inline, atomic node that links to a subpage. It stores the subpage id and a
 * cached title (kept in sync by the Editor). Clicking it is handled in the editor's
 * `handleClickOn` so it navigates instead of just selecting the node.
 */
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
});
