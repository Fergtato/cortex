import { useLayoutEffect, useRef, useState } from "react";

/*
 * Charts for every module, built to the dataviz rules: single series in
 * --data-1, the highlighted period in --data-2 with a direct label, bars at most
 * 24px with a 4px rounded data end and a square baseline, hairline gridlines,
 * and a hover/focus tooltip per mark whose hit area is the whole band.
 */


export interface Bar {
  key: string;
  label: string;
  value: number;
  highlight?: boolean;
}

/** Round tick step for an axis reaching `max`. */
function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Single-series column chart (dataviz spec): ink bars ≤24px with a 4px rounded
 * data end and a square baseline, the highlighted bar in the accent with its
 * value labelled, hairline gridlines, a per-bar hover/focus tooltip whose hit
 * area is the whole band. Values must be ≥ 0.
 */
export function BarChart({ bars, format, formatTick, height = 200, label }: { bars: Bar[]; format: (v: number) => string; formatTick: (v: number) => string; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const padB = 24;
  const padT = 20;
  const plotH = height - padB - padT;
  const max = Math.max(0, ...bars.map((b) => b.value));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  // No data: just the baseline (a 0..1 minor-unit axis would label both ends "£0").
  const ticks = max > 0 ? Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) : [0];
  // Left gutter fits the longest tick label (¥1,200,000 needs far more than £30); mono digits ≈ 7px at 11px.
  const padL = Math.max(36, Math.ceil(Math.max(...ticks.map((t) => formatTick(t).length)) * 7) + 16);
  const plotW = Math.max(0, width - padL);
  const band = bars.length ? plotW / bars.length : 0;
  const barW = Math.min(24, Math.max(4, band * 0.5));
  const y = (v: number) => padT + plotH - (v / top) * plotH;

  const roundedTop = (x: number, yTop: number, w: number, h: number) => {
    const r = Math.min(4, h, w / 2);
    if (h <= 0) return "";
    return `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yTop + h} Z`;
  };

  return (
    <div className="cx-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="cx-chart__grid" x1={padL} x2={width} y1={y(t)} y2={y(t)} />
              <text className="cx-chart__tick" x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = padL + band * i + band / 2;
            const h = Math.max(0, y(0) - y(b.value));
            return (
              <g key={b.key}>
                <path className={`cx-chart__bar${b.highlight ? " is-highlight" : ""}${hover === i ? " is-hover" : ""}`} d={roundedTop(cx - barW / 2, y(b.value), barW, h)} />
                {b.highlight && b.value > 0 && (
                  <text className="cx-chart__value" x={cx} y={y(b.value) - 6} textAnchor="middle">
                    {format(b.value)}
                  </text>
                )}
                <text className={`cx-chart__tick${b.highlight ? " is-strong" : ""}`} x={cx} y={height - 6} textAnchor="middle">
                  {b.label}
                </text>
                {/* hit area: the whole band, focusable for keyboard readers */}
                <rect
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${b.label}: ${format(b.value)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <div className="cx-chart-tooltip" style={{ left: Math.min(width - 120, Math.max(0, padL + band * hover + band / 2 - 60)), top: Math.max(0, y(bars[hover].value) - 52) }}>
          <strong>{format(bars[hover].value)}</strong>
          <span>{bars[hover].label}</span>
        </div>
      )}
    </div>
  );
}


/** Ranked horizontal bars with each amount printed (a bar-table: readable without hover). */
export function RankedBars({ rows, format, emptyText = "Nothing yet." }: { rows: { id: string; label: string; value: number; over?: boolean }[]; format: (v: number) => string; emptyText?: string }) {
  const top = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="cx-chart-empty">{emptyText}</p>;
  return (
    <ul className="cx-ranked">
      {rows.map((r) => (
        <li key={r.id}>
          <span className="cx-ranked__label">{r.label}</span>
          <span className="cx-ranked__track">
            <span className={`cx-ranked__fill${r.over ? " is-over" : ""}`} style={{ width: `${(r.value / top) * 100}%` }} />
          </span>
          <span className="cx-ranked__value">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
