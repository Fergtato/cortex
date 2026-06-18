import { useState } from "react";
import type { Editor } from "@tiptap/react";
import { useDialog } from "./Dialog";

interface Props {
  editor: Editor;
  onInsertSubpage: () => void;
  onInsertDatabase: () => void;
  onInsertImage: () => void;
}

const TEXT_COLORS: { name: string; value: string | null }[] = [
  { name: "default", value: null },
  { name: "red", value: "#e06c75" },
  { name: "orange", value: "#e5a05a" },
  { name: "yellow", value: "#e6d05a" },
  { name: "green", value: "#7fd17f" },
  { name: "blue", value: "#6fb3e0" },
  { name: "purple", value: "#b78fe0" },
  { name: "gray", value: "#9aa0a6" },
];

const HIGHLIGHTS: { name: string; value: string | null }[] = [
  { name: "none", value: null },
  { name: "red", value: "#5a2d2d" },
  { name: "orange", value: "#5a472d" },
  { name: "yellow", value: "#56522a" },
  { name: "green", value: "#2d5a3a" },
  { name: "blue", value: "#2d425a" },
  { name: "purple", value: "#4a2d5a" },
  { name: "gray", value: "#454545" },
];

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
  const [palette, setPalette] = useState<"color" | "highlight" | null>(null);

  function applyColor(value: string | null) {
    if (value) editor.chain().focus().setColor(value).run();
    else editor.chain().focus().unsetColor().run();
    setPalette(null);
  }
  function applyHighlight(value: string | null) {
    if (value) editor.chain().focus().setHighlight({ color: value }).run();
    else editor.chain().focus().unsetHighlight().run();
    setPalette(null);
  }

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

      <span className="tool-palette-wrap">
        <button
          className={`tool-btn${editor.isActive("textStyle") ? " active" : ""}`}
          title="Text color"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPalette(palette === "color" ? null : "color")}
        >
          A▾
        </button>
        {palette === "color" && (
          <Palette items={TEXT_COLORS} kind="text" onPick={applyColor} onClose={() => setPalette(null)} />
        )}
      </span>

      <span className="tool-palette-wrap">
        <button
          className={`tool-btn${editor.isActive("highlight") ? " active" : ""}`}
          title="Highlight color"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setPalette(palette === "highlight" ? null : "highlight")}
        >
          ▮▾
        </button>
        {palette === "highlight" && (
          <Palette items={HIGHLIGHTS} kind="bg" onPick={applyHighlight} onClose={() => setPalette(null)} />
        )}
      </span>

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

function Palette({
  items,
  kind,
  onPick,
  onClose,
}: {
  items: { name: string; value: string | null }[];
  kind: "text" | "bg";
  onPick: (value: string | null) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="tool-palette-backdrop" onMouseDown={onClose} />
      <div className="tool-palette" onMouseDown={(e) => e.stopPropagation()}>
        {items.map((c) => (
          <button
            key={c.name}
            className="tool-swatch"
            title={c.name}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(c.value)}
          >
            <span
              className="tool-swatch-chip"
              style={
                c.value === null
                  ? { background: "transparent" }
                  : kind === "text"
                  ? { color: c.value, background: "transparent" }
                  : { background: c.value }
              }
            >
              {kind === "text" ? "A" : ""}
            </span>
            <span className="tool-swatch-name">{c.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
