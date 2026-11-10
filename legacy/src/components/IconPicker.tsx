import { useState } from "react";
import { SELECT_COLORS, type SelectColor } from "../types";
import { Icon, ICON_NAMES } from "./Icon";

interface Props {
  current?: string;
  currentColor?: SelectColor;
  onPick: (icon: string | undefined) => void;
  onPickColor: (color: SelectColor | undefined) => void;
  onClose: () => void;
}

/** Cap the rendered grid — the catalogue is ~2000 icons; filtering narrows it. */
const MAX_SHOWN = 180;

/** In-app picker for a page's Lucide line-icon + palette colour. */
export function IconPicker({ current, currentColor, onPick, onPickColor, onClose }: Props) {
  const [filter, setFilter] = useState("");

  const matches = filter.trim()
    ? ICON_NAMES.filter((n) => n.includes(filter.trim().toLowerCase()))
    : ICON_NAMES;
  const names = matches.slice(0, MAX_SHOWN);

  return (
    <>
      <div className="filter-pop-backdrop" onMouseDown={onClose} />
      <div className="icon-picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="icon-picker-head">
          <input
            className="filter-pop-input"
            placeholder="Filter icons…"
            value={filter}
            autoFocus
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && names.length > 0) {
                onPick(names[0]);
                onClose();
              }
            }}
          />
          {current && (
            <button
              className="db-control-btn"
              onClick={() => {
                onPick(undefined);
                onPickColor(undefined);
                onClose();
              }}
            >
              remove
            </button>
          )}
        </div>
        <div className="icon-picker-colors">
          <button
            className={`select-swatch swatch-none${!currentColor ? " active" : ""}`}
            title="text colour"
            onClick={() => onPickColor(undefined)}
          >
            ×
          </button>
          {SELECT_COLORS.map((c) => (
            <button
              key={c}
              className={`select-swatch selc-${c}${currentColor === c ? " active" : ""}`}
              title={c}
              onClick={() => onPickColor(c)}
            />
          ))}
        </div>
        <div className="icon-picker-grid">
          {names.map((n) => (
            <button
              key={n}
              className={`icon-picker-cell${current === n ? " active" : ""}`}
              title={n}
              onClick={() => {
                onPick(n);
                onClose();
              }}
            >
              <Icon name={n} size={16} color={currentColor} />
            </button>
          ))}
          {names.length === 0 && (
            <span className="filter-hint icon-picker-empty">no matching icons</span>
          )}
        </div>
        {matches.length > MAX_SHOWN && (
          <div className="icon-picker-more">
            showing {MAX_SHOWN} of {matches.length} — type to narrow
          </div>
        )}
      </div>
    </>
  );
}
