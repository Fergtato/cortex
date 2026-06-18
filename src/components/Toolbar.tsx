import type { Editor } from "@tiptap/react";
import { useDialog } from "./Dialog";

interface Props {
  editor: Editor;
  onInsertSubpage: () => void;
  onInsertDatabase: () => void;
  onInsertImage: () => void;
}

interface Btn {
  label: string;
  title: string;
  isActive: () => boolean;
  run: () => void;
}

export function Toolbar({
  editor,
  onInsertSubpage,
  onInsertDatabase,
  onInsertImage,
}: Props) {
  const dialog = useDialog();

  async function setLink() {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const prev = (editor.getAttributes("link").href as string) ?? "";
    const url = await dialog.prompt("Link URL:", prev);
    if (url === null) return;
    if (url.trim() === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  const buttons: Btn[] = [
    {
      label: "B",
      title: "Bold",
      isActive: () => editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "I",
      title: "Italic",
      isActive: () => editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "S",
      title: "Strikethrough",
      isActive: () => editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "<>",
      title: "Inline code",
      isActive: () => editor.isActive("code"),
      run: () => editor.chain().focus().toggleCode().run(),
    },
    {
      label: "🔗",
      title: "Link (select text first)",
      isActive: () => editor.isActive("link"),
      run: () => setLink(),
    },
    {
      label: "H1",
      title: "Heading 1",
      isActive: () => editor.isActive("heading", { level: 1 }),
      run: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    },
    {
      label: "H2",
      title: "Heading 2",
      isActive: () => editor.isActive("heading", { level: 2 }),
      run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "H3",
      title: "Heading 3",
      isActive: () => editor.isActive("heading", { level: 3 }),
      run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "•",
      title: "Bullet list",
      isActive: () => editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "1.",
      title: "Ordered list",
      isActive: () => editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "[ ]",
      title: "Task list",
      isActive: () => editor.isActive("taskList"),
      run: () => editor.chain().focus().toggleTaskList().run(),
    },
    {
      label: '"',
      title: "Blockquote",
      isActive: () => editor.isActive("blockquote"),
      run: () => editor.chain().focus().toggleBlockquote().run(),
    },
    {
      label: "{}",
      title: "Code block",
      isActive: () => editor.isActive("codeBlock"),
      run: () => editor.chain().focus().toggleCodeBlock().run(),
    },
    {
      label: "—",
      title: "Horizontal rule",
      isActive: () => false,
      run: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];

  return (
    <div className="toolbar">
      {buttons.map((b) => (
        <button
          key={b.title}
          className={`tool-btn${b.isActive() ? " active" : ""}`}
          title={b.title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={b.run}
        >
          {b.label}
        </button>
      ))}
      <button
        className="tool-btn tool-subpage"
        title="Insert subpage"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onInsertSubpage}
      >
        ▸ subpage
      </button>
      <button
        className="tool-btn tool-subpage"
        title="Embed a database"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onInsertDatabase}
      >
        ▤ database
      </button>
      <button
        className="tool-btn tool-subpage"
        title="Insert an image"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onInsertImage}
      >
        ▣ image
      </button>
    </div>
  );
}
