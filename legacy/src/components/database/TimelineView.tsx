import type { Database, DatabaseRow, PropertyDef } from "../../types";
import type { Store } from "../../store";

interface Props {
  db: Database;
  store: Store;
  /** Rows to display (already filtered/sorted by the host). */
  rows: DatabaseRow[];
  /** Hide schema-editing controls (adding a date property). */
  lockSchema?: boolean;
  /** Minimal chrome: hide the new-item button. */
  minimal?: boolean;
}

function rowTitle(db: Database, row: DatabaseRow): string {
  const titleProp = db.properties[0];
  const v = row.cells[titleProp.id];
  return typeof v === "string" && v ? v : "untitled";
}

function rowDate(row: DatabaseRow, dateProp: PropertyDef): number | null {
  const v = row.cells[dateProp.id];
  if (typeof v !== "string" || !v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function fmt(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TimelineView({ db, store, rows, lockSchema, minimal }: Props) {
  const dateProp = db.properties.find((p) => p.type === "date");

  if (!dateProp) {
    return (
      <div className="timeline-empty">
        timeline needs a <strong>date</strong> property.
        {!lockSchema && (
          <>
            <br />
            add one in the table view, or:
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

  const dated = rows
    .map((r) => ({ row: r, t: rowDate(r, dateProp) }))
    .filter((x): x is { row: DatabaseRow; t: number } => x.t !== null)
    .sort((a, b) => a.t - b.t);

  const unscheduled = rows.filter((r) => rowDate(r, dateProp) === null);

  const min = dated.length ? dated[0].t : 0;
  const max = dated.length ? dated[dated.length - 1].t : 0;
  const span = max - min;
  const pct = (t: number) => (span === 0 ? 50 : ((t - min) / span) * 100);

  return (
    <div className="timeline-wrap">
      {dated.length === 0 ? (
        <p className="timeline-hint">no items have a date yet.</p>
      ) : (
        <div className="timeline">
          <div className="timeline-axis">
            <span>{fmt(min)}</span>
            <span className="timeline-prop">on: {dateProp.name}</span>
            <span>{fmt(max)}</span>
          </div>
          <div className="timeline-track">
            {dated.map(({ row, t }, i) => {
              const left = pct(t);
              return (
                <div
                  key={row.id}
                  className="timeline-item"
                  style={{
                    left: `${left}%`,
                    top: `${(i % 6) * 34}px`,
                    transform: left > 80 ? "translateX(-100%)" : "none",
                  }}
                  title={fmt(t)}
                >
                  <span className="ti-dot">◆</span>
                  <span className="ti-label">{rowTitle(db, row)}</span>
                  <span className="ti-date">{fmt(t)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {unscheduled.length > 0 && (
        <div className="timeline-unscheduled">
          <div className="subpages-head">── unscheduled ──</div>
          <ul>
            {unscheduled.map((row) => (
              <li key={row.id}>· {rowTitle(db, row)}</li>
            ))}
          </ul>
        </div>
      )}

      {!minimal && (
        <button className="add-row-btn" onClick={() => store.addRow(db.id)}>
          + new item
        </button>
      )}
    </div>
  );
}
