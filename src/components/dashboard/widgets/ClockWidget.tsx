import { useEffect, useState } from "react";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Digital date/time. Config: h24, seconds, date (all booleans). */
export function ClockWidget({ widget }: WidgetProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const h24 = widget.config.h24 !== false;
  const seconds = widget.config.seconds !== false;
  const date = widget.config.date !== false;

  let hours = now.getHours();
  let suffix = "";
  if (!h24) {
    suffix = hours < 12 ? " AM" : " PM";
    hours = hours % 12 || 12;
  }
  const time =
    `${pad(hours)}:${pad(now.getMinutes())}` +
    (seconds ? `:${pad(now.getSeconds())}` : "") +
    suffix;

  return (
    <div className="dw-clock">
      <div className="dw-clock-time">{time}</div>
      {date && (
        <div className="dw-clock-date">
          {now.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </div>
      )}
    </div>
  );
}

export function ClockConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const opts: { key: "h24" | "seconds" | "date"; label: string }[] = [
    { key: "h24", label: "24-hour" },
    { key: "seconds", label: "seconds" },
    { key: "date", label: "date" },
  ];
  return (
    <div className="dw-config-form">
      {opts.map((o) => (
        <label key={o.key} className="dw-config-row">
          <span className="cell-checkbox-wrap">
            <input
              type="checkbox"
              checked={widget.config[o.key] !== false}
              onChange={(e) => set({ [o.key]: e.target.checked })}
            />
          </span>
          {o.label}
        </label>
      ))}
    </div>
  );
}
