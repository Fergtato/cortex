import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { pickImage } from "../../../lib/image";

/**
 * Image cell. Stores a (downscaled) data URL in `config.src`; `config.fit`
 * chooses cover (fill, default) or contain (fit).
 */
export function ImageWidget({ widget, dash, store, editing }: WidgetProps) {
  const src = typeof widget.config.src === "string" ? widget.config.src : null;
  const fit = widget.config.fit === "fit" ? "contain" : "cover";

  async function choose() {
    const picked = await pickImage();
    if (picked) patchWidgetConfig(store, dash.id, widget.id, { src: picked });
  }

  if (!src) {
    return (
      <div className="dw-image-empty" onPointerDown={(e) => e.stopPropagation()}>
        {editing ? (
          <button className="meta-btn" onClick={choose}>
            ▣ add image
          </button>
        ) : (
          <span className="dw-text-empty">no image</span>
        )}
      </div>
    );
  }

  return (
    <div className="dw-image">
      <img src={src} alt="" style={{ objectFit: fit }} draggable={false} />
    </div>
  );
}

export function ImageConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const fit = widget.config.fit === "fit" ? "fit" : "fill";

  return (
    <div className="dw-config-form">
      <button
        className="meta-btn"
        onClick={async () => {
          const picked = await pickImage();
          if (picked) set({ src: picked });
        }}
      >
        ▣ {widget.config.src ? "change image" : "add image"}
      </button>
      <div className="dw-config-row-btns">
        {(["fill", "fit"] as const).map((mode) => (
          <button
            key={mode}
            className={`opt-btn${fit === mode ? " active" : ""}`}
            onClick={() => set({ fit: mode })}
          >
            {mode}
          </button>
        ))}
      </div>
      {typeof widget.config.src === "string" && (
        <button className="meta-btn dw-config-danger" onClick={() => set({ src: null })}>
          × remove image
        </button>
      )}
    </div>
  );
}
