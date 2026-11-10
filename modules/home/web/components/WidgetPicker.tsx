import { useWidgetDefs } from "@cortex/core";
import { Icon } from "@cortex/ui";

interface Props {
  onPick: (type: string) => void;
  onClose: () => void;
}

/** Popover listing every widget the installed modules offer. Positioned by the caller. */
export function WidgetPicker({ onPick, onClose }: Props) {
  const defs = Object.values(useWidgetDefs()).filter((d) => !d.hidden);
  return (
    <>
      <div className="dash-backdrop" onClick={onClose} />
      <div className="widget-picker" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cx-label widget-picker-head">Add widget</div>
        {defs.map((def) => (
          <button key={def.type} className="widget-picker-item" onClick={() => onPick(def.type)}>
            <span className="widget-picker-glyph">{def.glyph ?? <Icon name={def.icon} size={14} />}</span>
            {def.label}
          </button>
        ))}
      </div>
    </>
  );
}
