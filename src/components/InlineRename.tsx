import { useEffect, useRef, useState } from "react";

interface Props {
  /** Current name; pre-filled and auto-selected on mount. */
  value: string;
  /** Called with the trimmed new name (only when non-empty and changed). */
  onCommit: (name: string) => void;
  /** Called when editing ends without a change (Escape / empty / unchanged). */
  onCancel: () => void;
  className?: string;
}

/**
 * Inline rename input for sidebar rows. Commits on Enter/blur, cancels on
 * Escape. The host row must set `draggable={false}` while this is mounted so
 * text selection doesn't start an HTML5 drag.
 */
export function InlineRename({ value, onCommit, onCancel, className }: Props) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  // Guards the blur that fires after Enter/Escape already ended the edit.
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  function commit() {
    if (done.current) return;
    done.current = true;
    const t = text.trim();
    if (t && t !== value) onCommit(t);
    else onCancel();
  }

  function cancel() {
    if (done.current) return;
    done.current = true;
    onCancel();
  }

  return (
    <input
      ref={ref}
      className={className ?? "inline-rename"}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
