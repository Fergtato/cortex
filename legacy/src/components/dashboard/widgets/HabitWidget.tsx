import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { DbSelect, ViewSelect, PropSelect, strConf } from "./dbShared";
import { viewRows } from "../../database/viewRows";
import { computedCellValue } from "../../../lib/formula";

const WEEK_OPTIONS = [8, 16, 26, 52];

function weeksOf(config: Record<string, unknown>): number {
  const v = config.weeks;
  return typeof v === "number" && WEEK_OPTIONS.includes(v) ? v : 16;
}

/** Local YYYY-MM-DD for a Date. */
function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** count -> intensity level 0..4 */
function level(count: number): number {
  return count <= 0 ? 0 : Math.min(4, count);
}

/**
 * GitHub-activity-style habit calendar: one column per week (Mon-first), one
 * cell per day, coloured by how many rows of the chosen database carry that
 * date (optionally through a view's filters). "Did I work out?" at a glance.
 */
export function HabitWidget({ widget, store }: WidgetProps) {
  const dbId = strConf(widget.config, "databaseId");
  const datePropId = strConf(widget.config, "datePropId");
  const viewId = strConf(widget.config, "viewId");
  const label = strConf(widget.config, "label");
  const weeks = weeksOf(widget.config);
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const dateProp = db?.properties.find((p) => p.id === datePropId);

  if (!db || !dateProp) {
    return <div className="dw-unconfigured">choose a database + date property in ⚙</div>;
  }

  const view = db.views.find((v) => v.id === viewId); // undefined = all rows
  const rows = viewRows(db, view);

  // Count rows per day; date cells store "YYYY-MM-DD" (sometimes with time),
  // created_time computes to a millisecond timestamp.
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = computedCellValue(db, row, dateProp);
    let key: string | null = null;
    if (typeof v === "string" && v.length >= 10) key = v.slice(0, 10);
    else if (typeof v === "number") key = dayKey(new Date(v));
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Grid runs from the Monday `weeks-1` weeks back through this week.
  const today = new Date();
  const todayKey = dayKey(today);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);

  const cells: { key: string; count: number; future: boolean }[] = [];
  const cursor = new Date(monday);
  for (let i = 0; i < weeks * 7; i++) {
    const key = dayKey(cursor);
    cells.push({ key, count: counts.get(key) ?? 0, future: key > todayKey });
    cursor.setDate(cursor.getDate() + 1);
  }

  const total = cells.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="dw-habit">
      <div className="dw-habit-head">
        <span className="dw-habit-label">{label || db.name || "habit"}</span>
        <span className="dw-habit-total">
          {total} in {weeks}w
        </span>
      </div>
      <div className="dw-habit-grid" style={{ gridTemplateColumns: `repeat(${weeks}, 1fr)` }}>
        {cells.map((c) => (
          <span
            key={c.key}
            className={`dw-habit-cell lvl-${level(c.count)}${c.future ? " future" : ""}${
              c.key === todayKey ? " today" : ""
            }`}
            title={`${c.key} · ${c.count}`}
          />
        ))}
      </div>
    </div>
  );
}

export function HabitConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const dbId = strConf(widget.config, "databaseId");
  const db = dbId ? store.getDatabase(dbId) : undefined;

  return (
    <div className="dw-config-form">
      <label className="dw-config-label">database</label>
      <DbSelect
        store={store}
        value={dbId}
        onChange={(id) => set({ databaseId: id, viewId: "", datePropId: "" })}
      />
      <label className="dw-config-label">date property</label>
      <PropSelect
        db={db}
        value={strConf(widget.config, "datePropId")}
        onChange={(id) => set({ datePropId: id })}
        types={["date", "created_time"]}
        emptyLabel="— choose date property —"
      />
      <label className="dw-config-label">view (filters rows)</label>
      <ViewSelect
        db={db}
        value={strConf(widget.config, "viewId")}
        onChange={(id) => set({ viewId: id })}
        allowAll
      />
      <label className="dw-config-label">range</label>
      <div className="dw-config-row-btns">
        {WEEK_OPTIONS.map((w) => (
          <button
            key={w}
            className={`opt-btn${weeksOf(widget.config) === w ? " active" : ""}`}
            onClick={() => set({ weeks: w })}
          >
            {w}w
          </button>
        ))}
      </div>
      <label className="dw-config-label">label (optional)</label>
      <input
        className="cell-input dw-config-input"
        value={strConf(widget.config, "label")}
        placeholder="e.g. workouts"
        onChange={(e) => set({ label: e.target.value })}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}
