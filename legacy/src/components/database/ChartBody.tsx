import { useLayoutEffect, useRef, useState } from "react";
import type {
  ChartConfig,
  Database,
  DatabaseRow,
  SelectColor,
} from "../../types";
import { computedCellValue } from "../../lib/formula";
import { colorForIndex } from "../../storage/migrateDatabases";

/* ------------------------------ data prep ----------------------------- */

interface Series {
  name: string;
  color: SelectColor;
  /** One value per bucket (same order as ChartData.buckets). */
  values: number[];
}

export interface ChartData {
  buckets: { label: string; color: SelectColor }[];
  series: Series[];
  max: number;
}

function aggNumbers(agg: ChartConfig["yAgg"], ns: number[]): number {
  if (ns.length === 0) return 0;
  switch (agg ?? "sum") {
    case "avg":
      return ns.reduce((a, b) => a + b, 0) / ns.length;
    case "min":
      return Math.min(...ns);
    case "max":
      return Math.max(...ns);
    case "sum":
    default:
      return ns.reduce((a, b) => a + b, 0);
  }
}

/**
 * Bucket key(s) for a row's x value. Multiselect rows land in one bucket per
 * chosen tag (so "how many rows carry each tag" charts work); everything
 * else maps to a single bucket.
 */
function xKeys(db: Database, row: DatabaseRow, cfg: ChartConfig): string[] {
  const prop = db.properties.find((p) => p.id === cfg.xPropId);
  if (!prop) return ["—"];
  const v = computedCellValue(db, row, prop);
  if (v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) {
    return ["—"];
  }
  if (prop.type === "multiselect" && Array.isArray(v)) return v.map(String); // option ids
  if (prop.type === "select" && typeof v === "string") return [v]; // option id
  if (prop.type === "date" && typeof v === "string") return [v.slice(0, 10)];
  return [String(v)];
}

/**
 * Group the (already view-filtered) rows into x buckets and per-series
 * aggregated values. Select x/series properties use their options' order and
 * colours; other types sort ascending and cycle the palette.
 */
export function buildChartData(
  db: Database,
  rows: DatabaseRow[],
  cfg: ChartConfig
): ChartData | null {
  const xProp = db.properties.find((p) => p.id === cfg.xPropId);
  if (!xProp) return null;
  const yProp = db.properties.find((p) => p.id === cfg.yPropId);
  const seriesProp =
    cfg.kind === "multiline"
      ? db.properties.find((p) => p.id === cfg.seriesPropId && p.type === "select")
      : undefined;

  // ---- buckets, in a stable order ----
  const optionBuckets = xProp.type === "select" || xProp.type === "multiselect";
  const keys: string[] = [];
  const seen = new Set<string>();
  if (optionBuckets) {
    for (const o of xProp.options ?? []) {
      keys.push(o.id);
      seen.add(o.id);
    }
  }
  for (const row of rows) {
    for (const k of xKeys(db, row, cfg)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  if (!optionBuckets) {
    const numeric = keys.every((k) => k === "—" || !Number.isNaN(Number(k)));
    keys.sort((a, b) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return numeric ? Number(a) - Number(b) : a.localeCompare(b);
    });
  }

  const bucketLabel = (k: string) =>
    optionBuckets
      ? xProp.options?.find((o) => o.id === k)?.name ?? (k === "—" ? "—" : k)
      : k;
  const bucketColor = (k: string, i: number): SelectColor =>
    optionBuckets
      ? xProp.options?.find((o) => o.id === k)?.color ?? "gray"
      : colorForIndex(i);
  const buckets = keys.map((k, i) => ({ label: bucketLabel(k), color: bucketColor(k, i) }));
  if (buckets.length === 0) return null;

  // ---- series ----
  const seriesKeys: { key: string | null; name: string; color: SelectColor }[] = seriesProp
    ? [
        ...(seriesProp.options ?? []).map((o) => ({ key: o.id as string | null, name: o.name, color: o.color })),
        { key: null, name: "—", color: "gray" as SelectColor },
      ]
    : [{ key: null, name: "value", color: "green" }];

  const idx = new Map(keys.map((k, i) => [k, i]));
  const series: Series[] = seriesKeys.map((s) => ({
    name: s.name,
    color: s.color,
    values: keys.map(() => 0),
  }));
  // Collect raw numbers per bucket/series, then aggregate.
  const cells: number[][][] = seriesKeys.map(() => keys.map(() => []));
  for (const row of rows) {
    let si = 0;
    if (seriesProp) {
      const sv = row.cells[seriesProp.id];
      si = seriesKeys.findIndex((s) => s.key === (typeof sv === "string" && sv ? sv : null));
      if (si < 0) continue;
    }
    for (const k of xKeys(db, row, cfg)) {
      const bi = idx.get(k);
      if (bi === undefined) continue;
      if (yProp) {
        const v = Number(computedCellValue(db, row, yProp));
        if (!Number.isNaN(v)) cells[si][bi].push(v);
      } else {
        cells[si][bi].push(1); // row count
      }
    }
  }
  for (let si = 0; si < series.length; si++) {
    for (let bi = 0; bi < keys.length; bi++) {
      series[si].values[bi] = yProp
        ? aggNumbers(cfg.yAgg, cells[si][bi])
        : cells[si][bi].length;
    }
  }
  // Drop all-zero extra series (multiline with unused options).
  const kept = seriesProp ? series.filter((s) => s.values.some((v) => v !== 0)) : series;
  const max = Math.max(1, ...kept.flatMap((s) => s.values));
  return { buckets, series: kept.length ? kept : [series[0]], max };
}

/* ------------------------------ rendering ----------------------------- */

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

const fmt = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Math.abs(r) >= 1000 ? `${Math.round(r / 100) / 10}k` : String(r);
};

const sel = (c: SelectColor) => `var(--sel-${c})`;

interface BodyProps {
  db: Database;
  rows: DatabaseRow[];
  config: ChartConfig;
}

/**
 * Pure chart renderer (SVG in real pixels via ResizeObserver — crisp 1px TUI
 * lines, no scaling blur). Shared by the database chart view and the
 * dashboard chart widget.
 */
export function ChartBody({ db, rows, config }: BodyProps) {
  const { ref, w, h } = useSize<HTMLDivElement>();
  const data = buildChartData(db, rows, config);

  return (
    <div ref={ref} className="chart-body">
      {!data && <div className="dw-unconfigured">choose an x-axis property</div>}
      {data && w > 40 && h > 40 && (
        <>
          {config.kind === "multiline" && data.series.length > 1 && (
            <div className="chart-series-legend">
              {data.series.map((s) => (
                <span key={s.name} className="chart-legend-row">
                  <span className="chart-legend-swatch" style={{ background: sel(s.color) }} />
                  {s.name}
                </span>
              ))}
            </div>
          )}
          {config.kind === "pie" ? (
            <Pie data={data} w={w} h={h} />
          ) : config.kind === "bar" ? (
            <Bars data={data} w={w} h={h} />
          ) : (
            <Lines
              data={data}
              w={w}
              h={h - (config.kind === "multiline" && data.series.length > 1 ? 20 : 0)}
              multi={config.kind === "multiline"}
            />
          )}
        </>
      )}
    </div>
  );
}

const M = { top: 16, right: 10, bottom: 18, left: 38 };

function Grid({ w, h, max }: { w: number; h: number; max: number }) {
  const plotH = h - M.top - M.bottom;
  const lines = [0, 0.5, 1];
  return (
    <>
      {lines.map((f) => {
        const y = M.top + plotH * (1 - f);
        return (
          <g key={f}>
            <line x1={M.left} y1={y} x2={w - M.right} y2={y} className="chart-grid" />
            <text x={M.left - 5} y={y + 3} className="chart-tick" textAnchor="end">
              {fmt(max * f)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function XLabels({ data, w, h, band }: { data: ChartData; w: number; h: number; band: boolean }) {
  const n = data.buckets.length;
  const plotW = w - M.left - M.right;
  const maxLabels = Math.max(1, Math.floor(plotW / 52));
  const step = Math.ceil(n / maxLabels);
  return (
    <>
      {data.buckets.map((b, i) => {
        if (i % step !== 0) return null;
        const x = band
          ? M.left + (plotW / n) * (i + 0.5)
          : M.left + (n === 1 ? plotW / 2 : (plotW / (n - 1)) * i);
        const label = b.label.length > 9 ? `${b.label.slice(0, 8)}…` : b.label;
        return (
          <text key={i} x={x} y={h - 5} className="chart-tick" textAnchor="middle">
            {label}
          </text>
        );
      })}
    </>
  );
}

function Bars({ data, w, h }: { data: ChartData; w: number; h: number }) {
  const n = data.buckets.length;
  const plotW = w - M.left - M.right;
  const plotH = h - M.top - M.bottom;
  const band = plotW / n;
  const barW = Math.max(3, Math.min(band * 0.65, 60));
  const values = data.series[0].values;
  return (
    <svg width={w} height={h} className="chart-svg">
      <Grid w={w} h={h} max={data.max} />
      {values.map((v, i) => {
        const barH = Math.round((v / data.max) * plotH);
        const x = M.left + band * i + (band - barW) / 2;
        const y = M.top + plotH - barH;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={barH}
              fill={sel(data.buckets[i].color)}
              className="chart-bar"
            />
            {v > 0 && band > 26 && (
              <text x={x + barW / 2} y={y - 4} className="chart-val" textAnchor="middle">
                {fmt(v)}
              </text>
            )}
          </g>
        );
      })}
      <XLabels data={data} w={w} h={h} band />
    </svg>
  );
}

function Lines({ data, w, h, multi }: { data: ChartData; w: number; h: number; multi: boolean }) {
  const n = data.buckets.length;
  const plotW = w - M.left - M.right;
  const plotH = h - M.top - M.bottom;
  const px = (i: number) => M.left + (n === 1 ? plotW / 2 : (plotW / (n - 1)) * i);
  const py = (v: number) => M.top + plotH - (v / data.max) * plotH;
  const series = multi ? data.series : data.series.slice(0, 1);
  return (
    <svg width={w} height={h} className="chart-svg">
      <Grid w={w} h={h} max={data.max} />
      {series.map((s) => (
        <g key={s.name}>
          <polyline
            fill="none"
            stroke={multi ? sel(s.color) : "var(--accent)"}
            strokeWidth="1.5"
            points={s.values.map((v, i) => `${px(i)},${py(v)}`).join(" ")}
          />
          {n <= 40 &&
            s.values.map((v, i) => (
              <rect
                key={i}
                x={px(i) - 2}
                y={py(v) - 2}
                width={4}
                height={4}
                fill={multi ? sel(s.color) : "var(--accent)"}
              />
            ))}
        </g>
      ))}
      <XLabels data={data} w={w} h={h} band={false} />
    </svg>
  );
}

function Pie({ data, w, h }: { data: ChartData; w: number; h: number }) {
  const values = data.series[0].values;
  const total = values.reduce((a, b) => a + b, 0);
  const slices = data.buckets
    .map((b, i) => ({ ...b, value: values[i] }))
    .filter((s) => s.value > 0);
  const legendW = Math.min(150, w * 0.45);
  const r = Math.max(10, Math.min((w - legendW) / 2 - 10, h / 2 - 10));
  const cx = (w - legendW) / 2;
  const cy = h / 2;

  let angle = -Math.PI / 2;
  const paths = slices.map((s) => {
    const frac = total > 0 ? s.value / total : 0;
    const a0 = angle;
    const a1 = (angle += frac * Math.PI * 2);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    // A full single-slice circle can't be one arc; draw two half arcs.
    const d =
      frac >= 0.999
        ? `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`
        : `M ${cx} ${cy} L ${p0[0]} ${p0[1]} A ${r} ${r} 0 ${large} 1 ${p1[0]} ${p1[1]} Z`;
    return { ...s, d, frac };
  });

  return (
    <div className="chart-pie-wrap">
      <svg width={Math.max(0, w - legendW)} height={h} className="chart-svg">
        {paths.map((s, i) => (
          <path key={i} d={s.d} fill={sel(s.color)} className="chart-slice" />
        ))}
      </svg>
      <div className="chart-legend" style={{ width: legendW }}>
        {paths.map((s, i) => (
          <div key={i} className="chart-legend-row">
            <span className="chart-legend-swatch" style={{ background: sel(s.color) }} />
            <span className="chart-legend-name">{s.label}</span>
            <span className="chart-legend-val">{Math.round(s.frac * 100)}%</span>
          </div>
        ))}
        {slices.length === 0 && <div className="dw-text-empty">no data</div>}
      </div>
    </div>
  );
}
