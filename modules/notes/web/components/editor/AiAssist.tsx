import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { BubbleMenu, type Editor } from "@tiptap/react";
import { AiUnavailable, streamText, useAiStatus } from "@cortex/core";
import { markdownToHtml, singleParagraph } from "../../lib/markdown";

/*
 * AI in the editor. Select text → "Ask AI" → pick an action or type one; or
 * "/" → "Write with AI" at the cursor. The reply streams into a preview
 * panel under the text (outside the document, so the one editor instance is
 * never remounted); nothing changes until Replace or Insert.
 */

export interface AiRequestState {
  mode: "rewrite" | "write";
  from: number;
  to: number;
}

const REWRITES = [
  { label: "Improve writing", prompt: "Improve the writing: clearer, smoother, same meaning and tone." },
  { label: "Fix spelling & grammar", prompt: "Fix spelling, grammar and punctuation only. Change nothing else." },
  { label: "Make shorter", prompt: "Make it shorter and more concise." },
  { label: "Make longer", prompt: "Expand it with a little more detail." },
  { label: "Simplify", prompt: "Rewrite it in simpler, plainer words." },
  { label: "More formal", prompt: "Rewrite it in a more formal, professional tone." },
  { label: "More casual", prompt: "Rewrite it in a more casual, friendly tone." },
  { label: "Summarise", prompt: "Summarise it in a few sentences or bullet points." },
  { label: "Bullet points", prompt: "Turn it into a bulleted list." },
  { label: "Translate to English", prompt: "Translate it to English." },
];

const WRITES = [
  { label: "Summarise this page", prompt: "Summarise this page in a short paragraph and a few key bullet points." },
  { label: "Brainstorm ideas", prompt: "Brainstorm a list of ideas related to this page." },
  { label: "To-do list", prompt: "Write a task list of next steps based on this page." },
  { label: "Continue writing", prompt: "Continue writing from where the page leaves off, in the same style." },
];

/**
 * The floating "Ask AI" button on a text selection, only when an AI is
 * connected. The BubbleMenu stays mounted (tippy moves its element to
 * <body>, so unmounting it from React throws); visibility is decided in
 * shouldShow from refs, and the button itself renders only when wanted.
 */
export function AiBubble({ editor, onAsk, hidden }: { editor: Editor; onAsk: () => void; hidden: boolean }) {
  const status = useAiStatus();
  const show = !!status.data?.available && !hidden;
  const showRef = useRef(show);
  showRef.current = show;
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="aiBubble"
      tippyOptions={{ placement: "top-start", duration: 100 }}
      shouldShow={({ editor: e, from, to }) => showRef.current && e.isEditable && from !== to && !e.isActive("databaseEmbed") && !e.isActive("resizableImage") && e.state.doc.textBetween(from, to).trim().length > 0}
    >
      {show && (
        <button type="button" className="notes-ai-bubble" onMouseDown={(e) => e.preventDefault()} onClick={onAsk}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z" />
          </svg>
          Ask AI
        </button>
      )}
    </BubbleMenu>
  );
}

/** Text around a range, for context (what comes before matters most). */
function around(editor: Editor, from: number, to: number) {
  const doc = editor.state.doc;
  const before = doc.textBetween(Math.max(0, from - 3000), from, "\n", " ");
  const after = doc.textBetween(to, Math.min(doc.content.size, to + 1500), "\n", " ");
  return `${before.slice(-3500)}${before && after ? "\n…\n" : ""}${after.slice(0, 1500)}`.trim().slice(0, 6000);
}

export function AiPanel({
  editor,
  request,
  title,
  containerRef,
  onClose,
}: {
  editor: Editor;
  request: AiRequestState;
  title: string;
  containerRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const status = useAiStatus();
  const [instruction, setInstruction] = useState("");
  const [phase, setPhase] = useState<"ask" | "streaming" | "done">("ask");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [top, setTop] = useState(0);
  const lastPrompt = useRef("");
  const abort = useRef<AbortController | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const selected = request.mode === "rewrite" ? editor.state.doc.textBetween(request.from, request.to, "\n", " ") : "";

  // Sit just under the selection / cursor, inside the scrolling content.
  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    try {
      const c = editor.view.coordsAtPos(Math.min(request.to, editor.state.doc.content.size));
      setTop(c.bottom - box.getBoundingClientRect().top + 8);
    } catch {
      setTop(0);
    }
  }, [editor, request, containerRef]);

  useEffect(() => {
    input.current?.focus();
    panel.current?.scrollIntoView({ block: "nearest" });
    return () => abort.current?.abort();
  }, []);

  const close = useCallback(() => {
    abort.current?.abort();
    onClose();
    editor.commands.focus();
  }, [onClose, editor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (phase === "streaming") abort.current?.abort();
        else close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, close]);

  const run = async (prompt: string) => {
    const p = prompt.trim();
    if (!p) return;
    lastPrompt.current = p;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setPhase("streaming");
    setText("");
    setError("");
    let got = "";
    try {
      await streamText("/notes/ai", { mode: request.mode, instruction: p, text: selected, title, context: around(editor, request.from, request.to) }, (_d, all) => setText((got = all)), ac.signal);
      setPhase("done");
    } catch (e) {
      if (ac.signal.aborted) {
        setPhase("done");
        return;
      }
      setError(e instanceof Error ? e.message : "The AI couldn't do that.");
      setPhase(got ? "done" : "ask");
    }
  };

  const html = markdownToHtml(text);
  const apply = (how: "replace" | "below" | "insert") => {
    if (!html) return;
    const inlineHtml = singleParagraph(html);
    const doc = editor.state.doc;
    const $from = doc.resolve(request.from);
    const $to = doc.resolve(request.to);
    // After the top-level block holding the range: always a valid spot for any blocks.
    const afterTop = $to.depth >= 1 ? $to.after(1) : doc.content.size;
    const tryInsert = (at: number | { from: number; to: number }, content: string) => editor.chain().focus().insertContentAt(at, content).run();
    try {
      if (how === "replace") {
        // Inside one line, keep it inline; otherwise replace with the blocks.
        const sameBlock = $from.parent === $to.parent;
        tryInsert({ from: request.from, to: request.to }, inlineHtml && sameBlock ? inlineHtml : html);
      } else if (how === "below") {
        tryInsert(afterTop, html);
      } else {
        const empty = $from.parent.isTextblock && $from.parent.content.size === 0;
        if (inlineHtml && !empty) tryInsert(request.from, inlineHtml);
        else if (empty && $from.depth === 1) tryInsert({ from: $from.before(), to: $from.after() }, html);
        else tryInsert(afterTop, html);
      }
    } catch {
      // A shape the spot can't hold (e.g. headings inside a table cell): put it after the block instead.
      try {
        tryInsert(afterTop, html);
      } catch {
        setError("Couldn't insert here. Copy it from the preview instead.");
        return;
      }
    }
    onClose();
  };

  const chips = request.mode === "rewrite" ? REWRITES : WRITES;
  return (
    <div ref={panel} className="notes-ai" style={{ top }} role="dialog" aria-label={request.mode === "rewrite" ? "Ask AI about the selection" : "Write with AI"} onMouseDown={(e) => e.stopPropagation()}>
      {status.isSuccess && !status.data.available ? (
        <div className="notes-ai__row">
          <AiUnavailable />
          <button type="button" className="notes-ai__btn" onClick={close}>
            Close
          </button>
        </div>
      ) : (
        <>
          {(phase !== "ask" || text) && (
            <div className="notes-ai__preview">
              {html ? <div className="notes-ai__out ProseMirror" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="notes-ai__muted">Thinking…</p>}
              {phase === "streaming" && <span className="notes-ai__cursor" aria-hidden />}
            </div>
          )}
          {error && <p className="notes-ai__error">{error}</p>}
          {phase === "done" && text ? (
            <div className="notes-ai__row notes-ai__actions">
              {request.mode === "rewrite" ? (
                <>
                  <button type="button" className="notes-ai__btn notes-ai__btn--primary" onClick={() => apply("replace")}>
                    Replace
                  </button>
                  <button type="button" className="notes-ai__btn" onClick={() => apply("below")}>
                    Insert below
                  </button>
                </>
              ) : (
                <button type="button" className="notes-ai__btn notes-ai__btn--primary" onClick={() => apply("insert")}>
                  Insert
                </button>
              )}
              <button type="button" className="notes-ai__btn" onClick={() => run(lastPrompt.current)}>
                Try again
              </button>
              <button
                type="button"
                className="notes-ai__btn"
                onClick={() => {
                  setText("");
                  setPhase("ask");
                  setTimeout(() => input.current?.focus());
                }}
              >
                Change request
              </button>
              <button type="button" className="notes-ai__btn notes-ai__btn--ghost" onClick={close}>
                Discard
              </button>
            </div>
          ) : phase === "streaming" ? (
            <div className="notes-ai__row">
              <span className="notes-ai__muted">Writing with {status.data?.connection?.name ?? "AI"}…</span>
              <button type="button" className="notes-ai__btn" onClick={() => abort.current?.abort()}>
                Stop
              </button>
            </div>
          ) : (
            <>
              <form
                className="notes-ai__ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(instruction);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                  <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
                </svg>
                <input
                  ref={input}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder={request.mode === "rewrite" ? "Tell AI what to do with the selection…" : "What should AI write? e.g. a packing list for a weekend away"}
                  aria-label="Instruction for AI"
                />
                <button type="submit" className="notes-ai__btn notes-ai__btn--primary" disabled={!instruction.trim()}>
                  Go
                </button>
              </form>
              <div className="notes-ai__chips">
                {chips.map((c) => (
                  <button key={c.label} type="button" className="notes-ai__chip" onClick={() => run(c.prompt)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
