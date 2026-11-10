import { useEffect, useRef, useState } from "react";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";

export const DEFAULT_PRESETS = [30, 60, 90, 120, 300];

/** 30 -> "30s", 60 -> "1m", 90 -> "1.5m", 3600 -> "1h". */
export function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round((s / 60) * 10) / 10}m`;
  return `${Math.round((s / 3600) * 10) / 10}h`;
}

/** "30s" | "1.5m" | "1h" | bare number (seconds) -> seconds, or null. */
function parseDuration(token: string): number | null {
  const m = token.trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? "s").toLowerCase();
  const s = unit === "h" ? n * 3600 : unit === "m" ? n * 60 : n;
  return s > 0 ? Math.round(s) : null;
}

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Short square-wave beep; silently no-ops where audio is unavailable. */
function chime() {
  try {
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio available */
  }
}

function presetsOf(config: Record<string, unknown>): number[] {
  const p = config.presets;
  return Array.isArray(p) && p.length > 0 && p.every((n) => typeof n === "number")
    ? (p as number[])
    : DEFAULT_PRESETS;
}

/**
 * Countdown timer. Clicking a preset starts it immediately; start/pause/reset
 * below the readout. Flashes and chimes at zero. Running state is local (not
 * persisted) — a reload resets the timer.
 */
export function TimerWidget({ widget }: WidgetProps) {
  const presets = presetsOf(widget.config);
  const [total, setTotal] = useState(presets[0]);
  const [remaining, setRemaining] = useState(presets[0] * 1000);
  const [running, setRunning] = useState(false);
  const [flash, setFlash] = useState(false);
  const endRef = useRef(0);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const rem = endRef.current - Date.now();
      if (rem <= 0) {
        setRemaining(0);
        setRunning(false);
        setFlash(true);
        chime();
        window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(false), 4000);
      } else {
        setRemaining(rem);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  function quickStart(seconds: number) {
    setTotal(seconds);
    setFlash(false);
    endRef.current = Date.now() + seconds * 1000;
    setRemaining(seconds * 1000);
    setRunning(true);
  }

  function toggleRun() {
    if (running) {
      setRemaining(Math.max(0, endRef.current - Date.now()));
      setRunning(false);
    } else {
      if (remaining <= 0) return;
      setFlash(false);
      endRef.current = Date.now() + remaining;
      setRunning(true);
    }
  }

  function reset() {
    setRunning(false);
    setFlash(false);
    setRemaining(total * 1000);
  }

  return (
    <div
      className={`dw-timer${flash ? " flashing" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={`dw-timer-time${running ? " running" : ""}`}>{fmtClock(remaining)}</div>
      <div className="dw-timer-presets">
        {presets.map((s) => (
          <button
            key={s}
            className={`opt-btn${s === total ? " active" : ""}`}
            title={`Start ${fmtDuration(s)}`}
            onClick={() => quickStart(s)}
          >
            {fmtDuration(s)}
          </button>
        ))}
      </div>
      <div className="dw-timer-controls">
        <button className="meta-btn" onClick={toggleRun} disabled={!running && remaining <= 0}>
          {running ? "⏸ pause" : "▶ start"}
        </button>
        <button className="meta-btn" onClick={reset}>
          ↺ reset
        </button>
      </div>
    </div>
  );
}

export function TimerConfigForm({ widget, dash, store }: WidgetProps) {
  const presets = presetsOf(widget.config);
  const [text, setText] = useState(presets.map(fmtDuration).join(", "));

  function commit() {
    const parsed = text
      .split(",")
      .map(parseDuration)
      .filter((n): n is number => n !== null);
    if (parsed.length > 0) {
      patchWidgetConfig(store, dash.id, widget.id, { presets: parsed });
      setText(parsed.map(fmtDuration).join(", "));
    } else {
      setText(presets.map(fmtDuration).join(", "));
    }
  }

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">quick-start presets</label>
      <input
        className="cell-input dw-config-input"
        value={text}
        placeholder="30s, 1m, 1.5m, 2m, 5m"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
        }}
      />
      <span className="dw-config-hint">comma-separated: 30s, 1.5m, 1h…</span>
    </div>
  );
}
