import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";

type Mode = "telemetry" | "hexdump" | "waveform";

const CHANNELS = ["PWR CORE", "O2 FLOW", "NAV SYNC", "SHIELD", "THERMAL", "UPLINK"];

function modeOf(config: Record<string, unknown>): Mode {
  return config.mode === "hexdump" || config.mode === "waveform"
    ? (config.mode as Mode)
    : "telemetry";
}

function randHexLine(addr: number, bytes: number): string {
  const hex = Array.from({ length: bytes }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0")
  );
  const ascii = Array.from({ length: bytes }, () => {
    const c = 33 + Math.floor(Math.random() * 93);
    return Math.random() < 0.3 ? "." : String.fromCharCode(c);
  });
  return `${addr.toString(16).padStart(6, "0")}  ${hex.join(" ")}  ${ascii.join("")}`;
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Read the laid-out size synchronously — the observer's initial delivery
    // can be missed during a mount storm, leaving the size stuck at 0.
    const read = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => {
        const w = Math.round(r.width);
        const h = Math.round(r.height);
        return s.w === w && s.h === h ? s : { w, h };
      });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, ...size };
}

/**
 * Purely decorative sci-fi readout — nonsensical live data for batcave
 * ambience. Modes: telemetry (drifting bar meters), hexdump (scrolling
 * memory), waveform (noisy sine at full frame rate). Everything scales with
 * the widget's cell.
 */
export function ScifiWidget({ widget }: WidgetProps) {
  const mode = modeOf(widget.config);
  const label = typeof widget.config.label === "string" ? widget.config.label : "TELEMETRY";
  const { ref, w, h } = useSize<HTMLDivElement>();

  // Data ticks ~8×/s (drifting meters, scrolling hex); the waveform animates
  // per-frame via requestAnimationFrame with a time-based phase.
  const [tick, setTick] = useState(0);
  const [time, setTime] = useState(0);
  const levels = useRef(CHANNELS.map(() => Math.random()));
  const addrRef = useRef(Math.floor(Math.random() * 0xf0000));
  // Pre-filled so the hexdump is busy from the first frame.
  const hexRef = useRef<string[]>(
    Array.from({ length: 64 }, (_, i) => randHexLine(addrRef.current - (64 - i) * 8, 8))
  );
  // Waveform noise offsets, refreshed per data tick so the trace shimmers
  // without white-noise flicker at 60fps.
  const noise = useRef(Array.from({ length: 64 }, () => 0));

  // Hexdump geometry from the measured cell: line height ~13px, ~6.6px/char.
  const hexLines = Math.max(3, Math.floor((h - 26) / 13));
  const hexBytes = Math.max(4, Math.min(16, Math.floor((w / 6.6 - 10) / 4)));
  const hexBytesRef = useRef(hexBytes);
  hexBytesRef.current = hexBytes;

  useEffect(() => {
    const id = window.setInterval(() => {
      levels.current = levels.current.map((v) =>
        Math.min(1, Math.max(0.02, v + (Math.random() - 0.5) * 0.14))
      );
      addrRef.current += hexBytesRef.current;
      hexRef.current = [
        ...hexRef.current.slice(-63),
        randHexLine(addrRef.current, hexBytesRef.current),
      ];
      noise.current = noise.current.map(() => (Math.random() - 0.5) * 3);
      setTick((t) => t + 1);
    }, 125);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (mode !== "waveform") return;
    let raf = 0;
    const loop = (t: number) => {
      setTime(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const phase = time / 260;

  return (
    <div ref={ref} className="dw-scifi">
      <div className="dw-scifi-head">
        <span className="dw-scifi-blink">●</span> {label}
      </div>

      {mode === "telemetry" && (
        <div className="dw-scifi-body dw-scifi-telemetry">
          {CHANNELS.map((name, i) => {
            const v = levels.current[i];
            const warn = v > 0.85 || v < 0.1;
            return (
              <div key={name} className={`dw-scifi-row${warn ? " warn" : ""}`}>
                <span className="dw-scifi-name">{name}</span>
                <span className="dw-scifi-meter">
                  <span
                    className="dw-scifi-meter-fill"
                    style={{ width: `${Math.round(v * 100)}%` }}
                  />
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
          {hexRef.current.slice(-hexLines).map((line, i) => (
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
              vectorEffect="non-scaling-stroke"
              points={Array.from({ length: 51 }, (_, i) => {
                const x = i * 2;
                const y =
                  20 +
                  Math.sin((i + phase * 1.6) * 0.45) * 9 +
                  Math.sin((i + phase) * 1.7) * 4 +
                  noise.current[i % noise.current.length];
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
