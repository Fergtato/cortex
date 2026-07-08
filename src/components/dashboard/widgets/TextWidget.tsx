import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";

/**
 * Plain text box. Directly editable in edit mode; static (scrollable) text in
 * view mode. Content lives in `config.text`.
 */
export function TextWidget({ widget, dash, store, editing }: WidgetProps) {
  const text = typeof widget.config.text === "string" ? widget.config.text : "";

  if (editing) {
    return (
      <textarea
        className="dw-text-input"
        value={text}
        placeholder="type something…"
        onChange={(e) => patchWidgetConfig(store, dash.id, widget.id, { text: e.target.value })}
        // Keep pointer/keyboard input away from the grid's drag handlers.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    );
  }

  return <div className="dw-text">{text || <span className="dw-text-empty">empty note</span>}</div>;
}
