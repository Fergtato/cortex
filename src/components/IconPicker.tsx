import { useState } from "react";

interface Props {
  current?: string;
  onPick: (icon: string | undefined) => void;
  onClose: () => void;
}

const EMOJI = [
  "📄", "📝", "📓", "📚", "📌", "📍", "🗂", "🗃", "🗄", "📦",
  "🏠", "🏗", "🏭", "🏢", "🌍", "🗺", "🧭", "🛠", "🔧", "⚙️",
  "💡", "🔥", "⚡", "✨", "🌟", "☀️", "🌙", "🌈", "🌱", "🌲",
  "🎯", "🎨", "🎬", "🎮", "🎵", "📷", "🎓", "🧪", "🔬", "🔭",
  "💻", "🖥", "📱", "🖨", "💾", "🗜", "🔒", "🔑", "🛡", "🧰",
  "📈", "📉", "📊", "💰", "🧾", "💳", "🛒", "✈️", "🚀", "🚗",
  "❤️", "✅", "❌", "⭐", "🏁", "🚩", "🔖", "📅", "⏰", "🧠",
];

/** Small in-app emoji grid for choosing a page icon (no native pickers). */
export function IconPicker({ current, onPick, onClose }: Props) {
  const [custom, setCustom] = useState("");

  return (
    <>
      <div className="filter-pop-backdrop" onMouseDown={onClose} />
      <div className="icon-picker" onMouseDown={(e) => e.stopPropagation()}>
        <div className="icon-picker-head">
          <input
            className="filter-pop-input"
            placeholder="Type any emoji…"
            value={custom}
            autoFocus
            maxLength={8}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                onPick(custom.trim());
                onClose();
              }
              if (e.key === "Escape") onClose();
            }}
          />
          {current && (
            <button
              className="db-control-btn"
              onClick={() => {
                onPick(undefined);
                onClose();
              }}
            >
              remove
            </button>
          )}
        </div>
        <div className="icon-picker-grid">
          {EMOJI.map((e) => (
            <button
              key={e}
              className={`icon-picker-cell${current === e ? " active" : ""}`}
              onClick={() => {
                onPick(e);
                onClose();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
