import { useState } from "react";
import type {
  Database,
  DatabaseRow,
  DatabaseView,
  SelectOption,
} from "../../types";
import type { Store } from "../../store";

interface Props {
  db: Database;
  store: Store;
  /** Rows to display (already filtered/sorted by the host). */
  rows: DatabaseRow[];
  view: DatabaseView;
  lockSchema?: boolean;
  /** Minimal chrome: hide group picker, new-card buttons, and card delete. */
  minimal?: boolean;
}

const UNGROUPED = "__none__";

export function KanbanView({ db, store, rows, view, lockSchema, minimal }: Props) {
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const titleProp = db.properties[0];
  const selectProps = db.properties.filter((p) => p.type === "select");
  const groupProp =
    db.properties.find((p) => p.id === view.groupByPropId && p.type === "select") ??
    selectProps[0];

  if (!groupProp) {
    return (
      <div className="timeline-empty">
        kanban needs a <strong>select</strong> property to group by.
        {!lockSchema && (
          <>
            <br />
            <button
              className="add-row-btn"
              onClick={() => store.addProperty(db.id, "Status", "select")}
            >
              + add a Status property
            </button>
          </>
        )}
      </div>
    );
  }

  const options = groupProp.options ?? [];
  const columns: { id: string; option: SelectOption | null }[] = [
    ...options.map((o) => ({ id: o.id, option: o })),
    { id: UNGROUPED, option: null },
  ];

  const rowsFor = (colId: string) =>
    rows.filter((r) => {
      const v = r.cells[groupProp.id];
      return colId === UNGROUPED
        ? !v || !options.some((o) => o.id === v)
        : v === colId;
    });

  const dropOn = (colId: string) => {
    if (dragRowId) {
      store.updateCell(
        db.id,
        dragRowId,
        groupProp.id,
        colId === UNGROUPED ? null : colId
      );
    }
    setDragRowId(null);
    setOverCol(null);
  };

  return (
    <div className="kanban-wrap">
      {!minimal && selectProps.length > 1 && (
        <div className="kanban-config">
          <span className="db-control-label">group by</span>
          <select
            className="db-control-select"
            value={groupProp.id}
            onChange={(e) =>
              store.updateView(db.id, view.id, { groupByPropId: e.target.value })
            }
          >
            {selectProps.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="kanban">
        {columns.map((col) => {
          const colRows = rowsFor(col.id);
          // Hide an empty ungrouped column to reduce noise.
          if (col.id === UNGROUPED && colRows.length === 0 && minimal) return null;
          return (
            <div
              key={col.id}
              className={`kanban-col${overCol === col.id && dragRowId ? " dragover" : ""}`}
              onDragOver={(e) => {
                if (dragRowId) {
                  e.preventDefault();
                  setOverCol(col.id);
                }
              }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(col.id);
              }}
            >
              <div className="kanban-col-head">
                {col.option ? (
                  <span className={`cell-pill selc-${col.option.color}`}>
                    {col.option.name}
                  </span>
                ) : (
                  <span className="kanban-col-none">no {groupProp.name.toLowerCase()}</span>
                )}
                <span className="kanban-count">{colRows.length}</span>
              </div>
              <div className="kanban-cards">
                {colRows.map((row) => (
                  <div
                    key={row.id}
                    className={`kanban-card${dragRowId === row.id ? " dragging" : ""}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragRowId(row.id);
                    }}
                    onDragEnd={() => {
                      setDragRowId(null);
                      setOverCol(null);
                    }}
                  >
                    <input
                      className="kanban-card-title"
                      placeholder="untitled"
                      value={
                        typeof row.cells[titleProp.id] === "string"
                          ? (row.cells[titleProp.id] as string)
                          : ""
                      }
                      onChange={(e) =>
                        store.updateCell(
                          db.id,
                          row.id,
                          titleProp.id,
                          e.target.value || null
                        )
                      }
                    />
                    {!minimal && (
                      <button
                        className="row-del kanban-card-del"
                        title="Delete item"
                        onClick={() => store.deleteRow(db.id, row.id)}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!minimal && (
                <button
                  className="kanban-add"
                  onClick={() =>
                    store.addRow(db.id, {
                      [groupProp.id]: col.id === UNGROUPED ? null : col.id,
                    })
                  }
                >
                  + new
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
