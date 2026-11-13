import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx";
import { CountUp } from "./motion";
import { Icon } from "./Icon";

export interface GridProps {
  columns?: number;
  rowHeight?: string;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

/** 12-column module grid with an 8px gap. */
export function Grid({ columns = 12, rowHeight, style, className, children }: GridProps) {
  return (
    <div
      className={cx("cx-grid", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: rowHeight, ...style }}
    >
      {children}
    </div>
  );
}

export interface PanelProps {
  label?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  span?: number;
  rows?: number;
  flush?: boolean;
  bracket?: boolean;
  tone?: "sunken" | "inverse";
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

/** A dashboard module. `span`/`rows` place it on a Grid. */
export function Panel({ label, meta, action, span, rows, flush, bracket, tone, style, className, children }: PanelProps) {
  const s: CSSProperties = { ...style };
  if (span) s.gridColumn = `span ${span}`;
  if (rows) s.gridRow = `span ${rows}`;
  const hasHead = label || meta || action;
  return (
    <section
      className={cx("cx-panel", flush && "cx-panel--flush", bracket && "cx-bracket", tone && `cx-panel--${tone}`, className)}
      style={s}
    >
      {hasHead && (
        <header className="cx-panel__head">
          {label && <span className="cx-label">{label}</span>}
          {(meta || action) && (
            <span className="cx-panel__aside">
              {meta && <span className="cx-panel__meta">{meta}</span>}
              {action}
            </span>
          )}
        </header>
      )}
      <div className="cx-panel__body">{children}</div>
    </section>
  );
}

export interface StatProps {
  label?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  delta?: string;
  trend?: "up" | "down";
  /** Overrides the delta colour (e.g. a falling heart rate is good). */
  good?: boolean;
  size?: "sm" | "md" | "lg";
  footer?: ReactNode;
  className?: string;
}

export function Stat({ label, value, unit, delta, trend, good, size, footer, className }: StatProps) {
  const t = trend ?? (delta?.startsWith("-") ? "down" : "up");
  const isGood = good ?? t === "up";
  return (
    <div className={cx("cx-stat", size && size !== "md" && `cx-stat--${size}`, className)}>
      {label && <span className="cx-label">{label}</span>}
      <div className="cx-stat__row">
        <span className="cx-stat__value">{typeof value === "string" ? <CountUp text={value} /> : value}</span>
        {unit && <span className="cx-stat__unit">{unit}</span>}
        {delta && (
          <span className={cx("cx-delta", isGood ? "cx-delta--good" : "cx-delta--bad")}>
            <Icon name={t === "down" ? "arrow-down" : "arrow-up"} size={12} strokeWidth={2} />
            {delta}
          </span>
        )}
      </div>
      {footer && <div className="cx-stat__foot">{footer}</div>}
    </div>
  );
}

export interface MeterProps {
  value: number;
  max?: number;
  segments?: number;
  tone?: "ink" | "accent" | "positive" | "negative";
  label?: ReactNode;
  valueLabel?: ReactNode;
  start?: ReactNode;
  end?: ReactNode;
  height?: number;
  className?: string;
}

/** Segmented tick bar for progress toward a known total. */
export function Meter({ value, max = 100, segments = 32, tone = "ink", label, valueLabel, start, end, height, className }: MeterProps) {
  const v = Math.max(0, Math.min(max, value || 0));
  const filled = Math.round((v / max) * segments);
  return (
    <div className={cx("cx-meter", `cx-meter--${tone}`, className)}>
      {(label || valueLabel) && (
        <div className="cx-meter__head">
          <span>{label}</span>
          <span>{valueLabel}</span>
        </div>
      )}
      <div
        className="cx-meter__ticks"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={v}
        aria-label={typeof label === "string" ? label : "Progress"}
        style={height ? { height } : undefined}
      >
        {Array.from({ length: segments }, (_, i) => (
          <span key={i} className={i < filled ? "is-on" : undefined} />
        ))}
      </div>
      {(start || end) && (
        <div className="cx-meter__head cx-meter__foot">
          <span>{start}</span>
          <span>{end}</span>
        </div>
      )}
    </div>
  );
}
