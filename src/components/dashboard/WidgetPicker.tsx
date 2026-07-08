import type { WidgetType } from "../../types";
import { WIDGET_DEFS, WIDGET_TYPES } from "./widgets/registry";

interface Props {
  onPick: (type: WidgetType) => void;
  onClose: () => void;
}

/** Popover listing every registered widget type. Positioned by the caller. */
export function WidgetPicker({ onPick, onClose }: Props) {
  return (
    <>
      <div className="tree-menu-backdrop" onClick={onClose} />
      <div className="widget-picker" onPointerDown={(e) => e.stopPropagation()}>
        <div className="widget-picker-head">add widget</div>
        {WIDGET_TYPES.map((t) => {
          const def = WIDGET_DEFS[t];
          return (
            <button key={t} className="widget-picker-item" onClick={() => onPick(t)}>
              <span className="widget-picker-glyph">{def.glyph}</span>
              {def.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
