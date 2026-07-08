import { useEffect, useRef, useState } from "react";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";

type Mode = "telemetry" | "hexdump" | "waveform";

const CHANNELS = ["PWR CORE", "O2 FLOW", "NAV SYNC", "SHIELD", "THERMAL", "UPLINK"];
const BAR_LEN = 14;
const HEX_LINES = 24;

function modeOf(config: Record<string, unknown>): Mode {
  return config.mode === "hexdump" || config.mode === "waveform"
    ? (config.mode as Mode)
    : "telemetry";
}

function randHexLine(addr: number): string {
  const bytes = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  );
  const ascii = Array.from({ length: 8 }, () => {
    const c = 33 + Math.floor(Math.random() * 93);
    return Math.random() < 0.3 ? "." : String.fromCharCode(c);
  });
  return `${addr.toString(16).padStart(6, "0")}  ${bytes.join(" ")}  ${ascii.join("")}`;
}

/**
 * Purely decorative sci-fi readout — nonsensical live data for batcave
 * ambience. Modes: telemetry (drifting bar meters), hexdump (scrolling
 * memory), waveform (noisy sine). `config.label` titles the panel.
 */
export function ScifiWidget({ widget }: WidgetProps) {
  const mode = modeOf(widget.config);
  const label = typeof widget.config.label === "string" ? widget.config.label : "TELEMETRY";
  const [tick, setTick] = useState(0);

  // Random-walked channel levels (0..1) so the bars drift instead of jitter.
  const levels = useRef(CHANNELS.map(() => Math.random()));
  const hexRef = useRef<string[]>([]);
  const addrRef = useRef(Math.floor(Math.random() * 0xf0000));

  useEffect(() => {
    const id = window.setInterval(() => {
      levels.current = levels.current.map((v) =>
        Math.min(1, Math.max(0.02, v + (Math.random() - 0.5) * 0.18))
      );
      addrRef.current += 8;
      hexRef.current = [...hexRef.current.slice(-(HEX_LINES - 1)), randHexLine(addrRef.current)];
      setTick((t) => t + 1);
    }, 300);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="dw-scifi">
      <div className="dw-scifi-head">
        <span className="dw-scifi-blink">●</span> {label}
      </div>

      {mode === "telemetry" && (
        <div className="dw-scifi-body dw-scifi-telemetry">
          {CHANNELS.map((name, i) => {
            const v = levels.current[i];
            const filled = Math.round(v * BAR_LEN);
            const warn = v > 0.85 || v < 0.1;
            return (
              <div key={name} className={`dw-scifi-row${warn ? " warn" : ""}`}>
                <span className="dw-scifi-name">{name}</span>
                <span className="dw-scifi-bar">
                  {"█".repeat(filled)}
                  {"░".repeat(BAR_LEN - filled)}
                </span>
                <span className="dw-scifi-val">{String(Math.round(v * 100)).padStart(3)}%</span>
              </div>
            );
          })}
          <div className="dw-scifi-foot">
            SYS {String(0xa000 + ((tick * 7) % 0x5fff)).slice(0, 5)} · LINK ACTIVE
          </div>
        </div>
      )}

      {mode === "hexdump" && (
        <div className="dw-scifi-body dw-scifi-hex">
          {hexRef.current.map((line, i) => (
            <div key={i} className="dw-scifi-hexline">
              {line}
            </div>
          ))}
        </div>
      )}

      {mode === "waveform" && (
        <div className="dw-scifi-body dw-scifi-wave">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth="0.8"
              points={Array.from({ length: 51 }, (_, i) => {
                const x = i * 2;
                const y =
                  20 +
                  Math.sin((i + tick * 1.6) * 0.45) * 9 +
                  Math.sin((i + tick) * 1.7) * 4 +
                  (Math.random() - 0.5) * 3;
                return `${x},${Math.max(2, Math.min(38, y)).toFixed(1)}`;
              }).join(" ")}
            />
            <line x1="0" y1="20" x2="100" y2="20" stroke="var(--line)" strokeWidth="0.3" />
          </svg>
          <div className="dw-scifi-foot">
            FREQ {(432 + ((tick * 13) % 400)).toFixed(0)}.{tick % 10}Hz · GAIN{" "}
            {(levels.current[0] * 40).toFixed(1)}dB
          </div>
        </div>
      )}
    </div>
  );
}

export function ScifiConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const mode = modeOf(widget.config);
  const label = typeof widget.config.label === "string" ? widget.config.label : "TELEMETRY";

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">panel label</label>
      <input
        className="cell-input dw-config-input"
        value={label}
        onChange={(e) => set({ label: e.target.value.toUpperCase() })}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <label className="dw-config-label">mode</label>
      <div className="dw-config-row-btns">
        {(["telemetry", "hexdump", "waveform"] as const).map((m) => (
          <button
            key={m}
            className={`opt-btn${mode === m ? " active" : ""}`}
            onClick={() => set({ mode: m })}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
