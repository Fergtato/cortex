import type { CSSProperties } from "react";
import { SELECT_COLORS, type SelectColor } from "../../../types";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";

const SIZES = { s: 11, m: 14, l: 20, xl: 30 } as const;
type TextSize = keyof typeof SIZES;

function styleOf(config: Record<string, unknown>): CSSProperties {
  const size = SIZES[(config.size as TextSize) ?? "m"] ?? SIZES.m;
  const align = (config.align as CSSProperties["textAlign"]) ?? "left";
  const color = config.color as SelectColor | undefined;
  return {
    fontSize: size,
    textAlign: align,
    ...(color ? { color: `var(--sel-${color})` } : {}),
  };
}

function valignClass(config: Record<string, unknown>): string {
  const v = config.valign;
  return v === "middle" || v === "bottom" ? ` valign-${v}` : "";
}

/**
 * Plain text box. Directly editable in edit mode; static in view mode.
 * Config: text, align (left/center/right), valign (top/middle/bottom),
 * size (s/m/l/xl), colour (palette).
 */
export function TextWidget({ widget, dash, store, editing }: WidgetProps) {
  const text = typeof widget.config.text === "string" ? widget.config.text : "";
  const style = styleOf(widget.config);

  if (editing) {
    return (
      <textarea
        className={`dw-text-input${valignClass(widget.config)}`}
        style={style}
        value={text}
        placeholder="type something…"
        onChange={(e) => patchWidgetConfig(store, dash.id, widget.id, { text: e.target.value })}
        // Keep pointer/keyboard input away from the grid's drag handlers.
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div className={`dw-text${valignClass(widget.config)}`} style={style}>
      <span className="dw-text-inner">
        {text || <span className="dw-text-empty">empty note</span>}
      </span>
    </div>
  );
}

export function TextConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const cfg = widget.config;

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">horizontal align</label>
      <div className="dw-config-row-btns">
        {(["left", "center", "right"] as const).map((a) => (
          <button
            key={a}
            className={`opt-btn${(cfg.align ?? "left") === a ? " active" : ""}`}
            onClick={() => set({ align: a })}
          >
            {a === "left" ? "⇤" : a === "center" ? "⇹" : "⇥"}
          </button>
        ))}
      </div>
      <label className="dw-config-label">vertical align</label>
      <div className="dw-config-row-btns">
        {(["top", "middle", "bottom"] as const).map((a) => (
          <button
            key={a}
            className={`opt-btn${(cfg.valign ?? "top") === a ? " active" : ""}`}
            onClick={() => set({ valign: a })}
          >
            {a === "top" ? "⤒" : a === "middle" ? "☰" : "⤓"}
          </button>
        ))}
      </div>
      <label className="dw-config-label">font size</label>
      <div className="dw-config-row-btns">
        {(Object.keys(SIZES) as TextSize[]).map((s) => (
          <button
            key={s}
            className={`opt-btn${(cfg.size ?? "m") === s ? " active" : ""}`}
            onClick={() => set({ size: s })}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="dw-config-label">colour</label>
      <div className="dw-text-colors">
        <button
          className={`select-swatch swatch-none${!cfg.color ? " active" : ""}`}
          title="text colour"
          onClick={() => set({ color: null })}
        />
        {SELECT_COLORS.map((c) => (
          <button
            key={c}
            className={`select-swatch swatch-${c}${cfg.color === c ? " active" : ""}`}
            title={c}
            onClick={() => set({ color: c })}
          />
        ))}
      </div>
    </div>
  );
}
