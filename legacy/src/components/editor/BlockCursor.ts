import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Replaces the browser's thin text caret with a thick terminal-style block
// cursor. The native caret is hidden via `caret-color: transparent` in
// styles.css; a widget decoration renders a blinking block at the (collapsed)
// selection head. The block is only shown while the editor is focused, via the
// `.ProseMirror-focused` CSS scoping.
export const BlockCursor = Extension.create({
  name: "blockCursor",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("blockCursor"),
        props: {
          decorations(state) {
            const { selection } = state;
            if (!selection.empty) return null;
            const widget = document.createElement("span");
            widget.className = "block-cursor";
            return DecorationSet.create(state.doc, [
              Decoration.widget(selection.head, widget, { side: 1 }),
            ]);
          },
        },
      }),
    ];
  },
});
