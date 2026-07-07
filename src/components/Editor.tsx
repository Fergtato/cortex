import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import TextStyle from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import type { Page } from "../types";
import { useStoreContext } from "../context";
import { useDialog } from "./Dialog";
import { Toolbar } from "./Toolbar";
import { SubpageLink } from "./SubpageLink";
import { DatabaseEmbed } from "./DatabaseEmbed";
import { ResizableImage } from "./ResizableImage";
import { Toggle } from "./editor/Toggle";
import { Columns, Column } from "./editor/Columns";
import { Tabs, Tab } from "./editor/Tabs";
import { BlockCursor } from "./editor/BlockCursor";
import { SlashCommands, type SlashActions } from "./editor/SlashCommands";
import { pickImage } from "../lib/image";

interface Props {
  page: Page;
  /** Current child pages, used to keep inline link titles in sync. */
  subpages: Page[];
  onChangeContent: (html: string) => void;
  /** Creates a child page and returns its id + title for inline insertion. */
  onCreateSubpage: () => { id: string; title: string };
  onCreatedNavigate: () => void;
  onOpenPage: (id: string) => void;
}

export function Editor({
  page,
  subpages,
  onChangeContent,
  onCreateSubpage,
  onCreatedNavigate,
  onOpenPage,
}: Props) {
  const store = useStoreContext();
  const dialog = useDialog();

  // Keep the latest callbacks in refs so the editor's handlers (captured once at
  // creation) always call the current versions without recreating the editor.
  const onChangeRef = useRef(onChangeContent);
  onChangeRef.current = onChangeContent;

  // Slash-menu actions: the extension is created once with the editor, so it
  // reads the current callbacks through this ref (assigned below each render).
  const slashActionsRef = useRef<SlashActions>({
    insertSubpage: () => {},
    insertPageLink: () => {},
    insertDatabase: () => {},
    insertImage: () => {},
  });

  // The editor is created ONCE and reused for every page. Switching pages swaps
  // its content (below) rather than tearing down and rebuilding the instance —
  // rebuilding per navigation is racy under StrictMode and can leave the editor
  // in a non-editable state.
  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      SubpageLink,
      DatabaseEmbed,
      ResizableImage,
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Table.configure({ resizable: false, HTMLAttributes: { class: "content-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Toggle,
      Columns,
      Column,
      Tabs,
      Tab,
      BlockCursor,
      SlashCommands.configure({ actions: () => slashActionsRef.current }),
      Placeholder.configure({ placeholder: "start writing… (/ for blocks)" }),
    ],
    content: page.content,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML()),
  });

  // Load the page's content when navigating to a different page. `false` keeps
  // this out of the undo history and prevents it from firing a spurious save.
  useEffect(() => {
    if (!editor) return;
    const incoming = page.content || "";
    if (editor.getHTML() !== incoming) {
      editor.commands.setContent(incoming, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, page.id]);

  // Keep inline subpage-link titles in sync with the live page titles.
  const titleSig = subpages.map((s) => `${s.id}:${s.title}`).join("|");
  useEffect(() => {
    if (!editor) return;
    const titles = new Map(subpages.map((s) => [s.id, s.title || "untitled"]));
    let tr = editor.state.tr;
    let changed = false;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "subpageLink") {
        const current = titles.get(node.attrs.pageId);
        if (current !== undefined && current !== node.attrs.title) {
          tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, title: current });
          changed = true;
        }
      }
    });
    if (changed) {
      tr.setMeta("addToHistory", false);
      editor.view.dispatch(tr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, page.id, titleSig]);

  function insertSubpage() {
    if (!editor) return;
    const { id, title } = onCreateSubpage();
    editor
      .chain()
      .focus()
      .insertContent([
        { type: "subpageLink", attrs: { pageId: id, title } },
        { type: "text", text: " " },
      ])
      .run();
    onCreatedNavigate();
    onOpenPage(id);
  }

  async function insertPageLink() {
    if (!editor) return;
    const pages = Object.values(store.pages).filter((p) => p.id !== page.id);
    if (pages.length === 0) return;
    const choice = await dialog.choose(
      "Link to page:",
      pages.map((p) => ({
        label: `▸ ${p.title || "untitled"}`,
        value: p.id,
      }))
    );
    if (!choice) return;
    const target = store.pages[choice];
    if (!target) return;
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "subpageLink",
          attrs: { pageId: choice, title: target.title || "untitled" },
        },
        { type: "text", text: " " },
      ])
      .run();
  }

  function insertDatabase() {
    if (!editor) return;
    // Insert an empty embed; the node view prompts for which database to show.
    editor.chain().focus().insertContent({ type: "databaseEmbed", attrs: { dbId: null } }).run();
  }

  async function insertImage() {
    if (!editor) return;
    const src = await pickImage();
    if (!src) return;
    editor.chain().focus().insertContent({ type: "resizableImage", attrs: { src } }).run();
  }

  slashActionsRef.current = {
    insertSubpage,
    insertPageLink,
    insertDatabase,
    insertImage,
  };

  if (!editor) return null;

  // Clicking the empty area below the text lands on the contenteditable root,
  // where ProseMirror can't resolve a caret position, so the editor never
  // focuses. Catch *those* clicks and move the cursor to the end. Crucially,
  // ignore clicks inside node views (e.g. a database embed's inputs) — those
  // must keep their own focus, or the editor would steal it back instantly.
  function focusEmptyArea(e: ReactMouseEvent<HTMLDivElement>) {
    if (!editor || editor.isFocused) return;
    const pmEl = e.currentTarget.querySelector<HTMLElement>(".ProseMirror");
    if (e.target !== e.currentTarget && e.target !== pmEl) return;
    pmEl?.focus();
    editor.commands.focus("end");
  }

  return (
    <div className="editor">
      <Toolbar
        editor={editor}
        onInsertSubpage={insertSubpage}
        onInsertPageLink={insertPageLink}
        onInsertDatabase={insertDatabase}
        onInsertImage={insertImage}
      />
      <div className="editor-content" onClick={focusEmptyArea}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
