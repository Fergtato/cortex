import { Extension, type Editor, type Range } from "@tiptap/core";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";

/**
 * "/" command menu: type a slash in an empty spot to insert any block.
 * The popup is plain DOM (no extra deps) styled by .slash-menu in styles.css.
 */

/** Host-provided insert actions that live outside simple editor commands. */
export interface SlashActions {
  insertSubpage: () => void;
  insertPageLink: () => void;
  insertDatabase: () => void;
  insertImage: () => void;
}

interface SlashItem {
  title: string;
  hint: string;
  icon: string;
  keywords: string;
  run: (editor: Editor, range: Range, actions: SlashActions) => void;
}

const del = (editor: Editor, range: Range) =>
  editor.chain().focus().deleteRange(range);

const ITEMS: SlashItem[] = [
  {
    title: "text", hint: "plain paragraph", icon: "¶", keywords: "paragraph plain",
    run: (e, r) => del(e, r).setParagraph().run(),
  },
  {
    title: "heading 1", hint: "large section heading", icon: "H1", keywords: "h1 title",
    run: (e, r) => del(e, r).setHeading({ level: 1 }).run(),
  },
  {
    title: "heading 2", hint: "medium section heading", icon: "H2", keywords: "h2",
    run: (e, r) => del(e, r).setHeading({ level: 2 }).run(),
  },
  {
    title: "heading 3", hint: "small section heading", icon: "H3", keywords: "h3",
    run: (e, r) => del(e, r).setHeading({ level: 3 }).run(),
  },
  {
    title: "bullet list", hint: "unordered list", icon: "•", keywords: "ul unordered",
    run: (e, r) => del(e, r).toggleBulletList().run(),
  },
  {
    title: "numbered list", hint: "ordered list", icon: "1.", keywords: "ol ordered",
    run: (e, r) => del(e, r).toggleOrderedList().run(),
  },
  {
    title: "task list", hint: "checkboxes", icon: "[ ]", keywords: "todo checkbox check",
    run: (e, r) => del(e, r).toggleTaskList().run(),
  },
  {
    title: "quote", hint: "blockquote", icon: "❝", keywords: "blockquote",
    run: (e, r) => del(e, r).toggleBlockquote().run(),
  },
  {
    title: "code block", hint: "monospace block", icon: "{}", keywords: "code snippet",
    run: (e, r) => del(e, r).toggleCodeBlock().run(),
  },
  {
    title: "divider", hint: "horizontal rule", icon: "—", keywords: "hr rule separator",
    run: (e, r) => del(e, r).setHorizontalRule().run(),
  },
  {
    title: "table", hint: "simple content table", icon: "⊞", keywords: "grid",
    run: (e, r) => del(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    title: "toggle", hint: "collapsible section", icon: "▸", keywords: "collapse details",
    run: (e, r) =>
      del(e, r)
        .insertContent({ type: "toggle", content: [{ type: "paragraph" }, { type: "paragraph" }] })
        .run(),
  },
  {
    title: "columns", hint: "2-column layout", icon: "▥", keywords: "layout side",
    run: (e, r) =>
      del(e, r)
        .insertContent({
          type: "columns",
          attrs: { borders: false },
          content: [
            { type: "column", content: [{ type: "paragraph" }] },
            { type: "column", content: [{ type: "paragraph" }] },
          ],
        })
        .run(),
  },
  {
    title: "tabs", hint: "tabbed sections", icon: "⊓", keywords: "tabbed",
    run: (e, r) =>
      del(e, r)
        .insertContent({
          type: "tabs",
          attrs: { active: 0 },
          content: [
            { type: "tab", attrs: { label: "Tab 1" }, content: [{ type: "paragraph" }] },
            { type: "tab", attrs: { label: "Tab 2" }, content: [{ type: "paragraph" }] },
          ],
        })
        .run(),
  },
  {
    title: "subpage", hint: "create + link a subpage", icon: "▸", keywords: "child page new",
    run: (e, r, a) => {
      del(e, r).run();
      a.insertSubpage();
    },
  },
  {
    title: "page link", hint: "link to an existing page", icon: "↗", keywords: "link mention",
    run: (e, r, a) => {
      del(e, r).run();
      a.insertPageLink();
    },
  },
  {
    title: "database", hint: "embed a database", icon: "▤", keywords: "table db embed",
    run: (e, r, a) => {
      del(e, r).run();
      a.insertDatabase();
    },
  },
  {
    title: "image", hint: "insert an image", icon: "▣", keywords: "picture photo",
    run: (e, r, a) => {
      del(e, r).run();
      a.insertImage();
    },
  },
];

interface SlashOptions {
  /** Accessor so the menu always sees the host's current callbacks. */
  actions: () => SlashActions;
}

export const SlashCommands = Extension.create<SlashOptions>({
  name: "slashCommands",

  addOptions() {
    return { actions: () => ({} as SlashActions) };
  },

  addProseMirrorPlugins() {
    const getActions = this.options.actions;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        allowSpaces: false,
        items: ({ query }) => {
          const q = query.toLowerCase();
          return ITEMS.filter(
            (i) => i.title.includes(q) || i.keywords.includes(q)
          );
        },
        command: ({ editor, range, props }) => {
          props.run(editor, range, getActions());
        },
        render: () => {
          let el: HTMLDivElement | null = null;
          let selected = 0;
          let current: SuggestionProps<SlashItem> | null = null;

          const paint = () => {
            if (!el || !current) return;
            el.innerHTML = "";
            if (current.items.length === 0) {
              const empty = document.createElement("div");
              empty.className = "slash-empty";
              empty.textContent = "no matching blocks";
              el.appendChild(empty);
              return;
            }
            current.items.forEach((item, i) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = `slash-item${i === selected ? " selected" : ""}`;
              btn.innerHTML = `<span class="slash-icon">${item.icon}</span><span class="slash-title">${item.title}</span><span class="slash-hint">${item.hint}</span>`;
              btn.addEventListener("mousedown", (e) => {
                e.preventDefault();
                current!.command(item);
              });
              btn.addEventListener("mouseenter", () => {
                selected = i;
                paint();
              });
              el!.appendChild(btn);
            });
          };

          const position = () => {
            if (!el || !current) return;
            const rect = current.clientRect?.();
            if (!rect) return;
            const menuH = el.offsetHeight;
            const below = rect.bottom + 4;
            const top =
              below + menuH > window.innerHeight && rect.top - menuH - 4 > 0
                ? rect.top - menuH - 4
                : below;
            el.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;
            el.style.top = `${top}px`;
          };

          return {
            onStart: (props) => {
              current = props;
              selected = 0;
              el = document.createElement("div");
              el.className = "slash-menu";
              document.body.appendChild(el);
              paint();
              position();
            },
            onUpdate: (props) => {
              current = props;
              if (selected >= props.items.length) selected = 0;
              paint();
              position();
            },
            onKeyDown: ({ event }) => {
              if (!current) return false;
              if (event.key === "Escape") {
                el?.remove();
                el = null;
                return true;
              }
              if (event.key === "ArrowDown") {
                selected = (selected + 1) % Math.max(current.items.length, 1);
                paint();
                return true;
              }
              if (event.key === "ArrowUp") {
                selected =
                  (selected - 1 + Math.max(current.items.length, 1)) %
                  Math.max(current.items.length, 1);
                paint();
                return true;
              }
              if (event.key === "Enter") {
                const item = current.items[selected];
                if (item) current.command(item);
                return true;
              }
              return false;
            },
            onExit: () => {
              el?.remove();
              el = null;
              current = null;
            },
          };
        },
      }),
    ];
  },
});
