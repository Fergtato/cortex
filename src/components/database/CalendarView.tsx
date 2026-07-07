import { useState } from "react";
import type { Database, DatabaseRow, DatabaseView } from "../../types";
import type { Store } from "../../store";

interface Props {
  db: Database;
  store: Store;
  /** Rows to display (already filtered/sorted by the host). */
  rows: DatabaseRow[];
  view: DatabaseView;
  lockSchema?: boolean;
  /** Minimal chrome: hide the date-prop picker and add-row affordances. */
  minimal?: boolean;
}

/** Local yyyy-mm-dd for a Date (date cells store this exact format). */
function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function CalendarView({ db, store, rows, view, lockSchema, minimal }: Props) {
  const today = new Date();
  const [cursor, setCursor] = useState<{ y: number; m: number }>({
    y: today.getFullYear(),
    m: today.getMonth(),
  });

  const titleProp = db.properties[0];
  const dateProps = db.properties.filter((p) => p.type === "date");
  const dateProp =
    db.properties.find((p) => p.id === view.datePropId && p.type === "date") ??
    dateProps[0];

  if (!dateProp) {
    return (
      <div className="timeline-empty">
        calendar needs a <strong>date</strong> property.
        {!lockSchema && (
          <>
            <br />
            <button
              className="add-row-btn"
              onClick={() => store.addProperty(db.id, "Date", "date")}
            >
              + add a Date property
            </button>
          </>
        )}
      </div>
    );
  }

  // Build a 6-week grid starting on the Monday on/before the 1st.
  const first = new Date(cursor.y, cursor.m, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const byDate = new Map<string, DatabaseRow[]>();
  for (const row of rows) {
    const v = row.cells[dateProp.id];
    if (typeof v !== "string" || !v) continue;
    const key = v.slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), row]);
  }

  const monthLabel = first.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayKey = iso(today);

  const rowTitle = (row: DatabaseRow) => {
    const v = row.cells[titleProp.id];
    return typeof v === "string" && v ? v : "untitled";
  };

  return (
    <div className="calendar-wrap">
      <div className="calendar-head">
        <button className="db-control-btn" onClick={() => setCursor(prev)} title="Previous month">
          ←
        </button>
        <span className="calendar-month">{monthLabel}</span>
        <button className="db-control-btn" onClick={() => setCursor(next)} title="Next month">
          →
        </button>
        <button
          className="db-control-btn"
          onClick={() => setCursor({ y: today.getFullYear(), m: today.getMonth() })}
        >
          today
        </button>
        {!minimal && dateProps.length > 1 && (
          <span className="calendar-prop-pick">
            <span className="db-control-label">on</span>
            <select
              className="db-control-select"
              value={dateProp.id}
              onChange={(e) =>
                store.updateView(db.id, view.id, { datePropId: e.target.value })
              }
            >
              {dateProps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </span>
        )}
      </div>

      <div className="calendar-grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = iso(d);
          const inMonth = d.getMonth() === cursor.m;
          const dayRows = byDate.get(key) ?? [];
          return (
            <div
              key={key}
              className={`calendar-day${inMonth ? "" : " outside"}${
                key === todayKey ? " today" : ""
              }`}
            >
              <div className="calendar-day-head">
                <span className="calendar-daynum">{d.getDate()}</span>
                {!minimal && (
                  <button
                    className="calendar-add"
                    title={`New item on ${key}`}
                    onClick={() => store.addRow(db.id, { [dateProp.id]: key })}
                  >
                    +
                  </button>
                )}
              </div>
              <div className="calendar-items">
                {dayRows.map((row) => (
                  <div key={row.id} className="calendar-item" title={rowTitle(row)}>
                    {rowTitle(row)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  function prev(cur: { y: number; m: number }) {
    return cur.m === 0 ? { y: cur.y - 1, m: 11 } : { y: cur.y, m: cur.m - 1 };
  }
  function next(cur: { y: number; m: number }) {
    return cur.m === 11 ? { y: cur.y + 1, m: 0 } : { y: cur.y, m: cur.m + 1 };
  }
}
