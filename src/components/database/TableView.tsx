import { useState } from "react";
import { PROPERTY_TYPES, type Database, type DatabaseRow } from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";
import { Cell } from "./Cell";

interface Props {
  db: Database;
  store: Store;
  /** Rows to display (already filtered/sorted by the host). */
  rows: DatabaseRow[];
  /** Hide schema-editing controls (property name/type/delete, add property). */
  lockSchema?: boolean;
  /** Minimal chrome: hide the new-row button and row-delete column. */
  minimal?: boolean;
}

export function TableView({ db, store, rows, lockSchema, minimal }: Props) {
  const dialog = useDialog();
  // Column drag state (header handles reorder via store.reorderProperties).
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const canWrap = (type: string) => type === "text" || type === "url";

  return (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            {db.properties.map((prop, i) => (
              <th
                key={prop.id}
                className={
                  overIdx === i && dragIdx !== null && dragIdx !== i ? "th-dragover" : undefined
                }
                onDragOver={(e) => {
                  if (dragIdx !== null && i > 0 && i !== dragIdx) {
                    e.preventDefault();
                    setOverIdx(i);
                  }
                }}
                onDragLeave={() => setOverIdx((cur) => (cur === i ? null : cur))}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIdx !== null && i > 0) store.reorderProperties(db.id, dragIdx, i);
                  setDragIdx(null);
                  setOverIdx(null);
                }}
              >
                {lockSchema ? (
                  <div className="th-inner">
                    <span className="th-name-ro">{prop.name}</span>
                  </div>
                ) : (
                  <div className="th-inner">
                    <div className="th-name-row">
                      {i > 0 && (
                        <span
                          className="th-drag"
                          title="Drag to reorder column"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            setDragIdx(i);
                          }}
                          onDragEnd={() => {
                            setDragIdx(null);
                            setOverIdx(null);
                          }}
                        >
                          ⠿
                        </span>
                      )}
                      <input
                        className="th-name"
                        value={prop.name}
                        onChange={(e) =>
                          store.updateProperty(db.id, prop.id, { name: e.target.value })
                        }
                      />
                    </div>
                    <div className="th-controls">
                      <select
                        className="th-type"
                        value={prop.type}
                        title="Property type"
                        onChange={(e) =>
                          store.updateProperty(db.id, prop.id, {
                            type: e.target.value as (typeof PROPERTY_TYPES)[number],
                          })
                        }
                      >
                        {PROPERTY_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                      {prop.type === "formula" && (
                        <button
                          className="th-wrap"
                          title={prop.formula ? `ƒ ${prop.formula}` : "Edit formula"}
                          onClick={async () => {
                            const raw = await dialog.prompt(
                              "Formula (reference fields by name, e.g. {Price} * {Qty}):",
                              prop.formula ?? ""
                            );
                            if (raw !== null) {
                              store.updateProperty(db.id, prop.id, { formula: raw });
                            }
                          }}
                        >
                          ƒ
                        </button>
                      )}
                      {canWrap(prop.type) && (
                        <button
                          className={`th-wrap${prop.wrap ? " active" : ""}`}
                          title={prop.wrap ? "Unwrap text (clip)" : "Wrap text (show all)"}
                          onClick={() =>
                            store.updateProperty(db.id, prop.id, { wrap: !prop.wrap })
                          }
                        >
                          ↵
                        </button>
                      )}
                      {i > 0 && (
                        <button
                          className="th-del"
                          title="Delete property"
                          onClick={async () => {
                            const ok = await dialog.confirm(
                              `Delete property "${prop.name}"?`,
                              { confirmLabel: "delete", danger: true }
                            );
                            if (ok) store.deleteProperty(db.id, prop.id);
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </th>
            ))}
            {!lockSchema && (
              <th className="th-add">
                <button
                  className="add-prop-btn"
                  title="Add property"
                  onClick={async () => {
                    const raw = await dialog.prompt("Property name:");
                    const name = raw?.trim();
                    if (name) store.addProperty(db.id, name, "text");
                  }}
                >
                  +
                </button>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {db.properties.map((prop) => (
                <td key={prop.id} className={prop.wrap ? "td-wrap" : undefined}>
                  <Cell
                    dbId={db.id}
                    prop={prop}
                    value={row.cells[prop.id] ?? null}
                    row={row}
                    store={store}
                    onChange={(v) => store.updateCell(db.id, row.id, prop.id, v)}
                  />
                </td>
              ))}
              {!minimal && (
                <td className="row-del-cell">
                  <button
                    className="row-del"
                    title="Delete row"
                    onClick={() => store.deleteRow(db.id, row.id)}
                  >
                    ×
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!minimal && (
        <button className="add-row-btn" onClick={() => store.addRow(db.id)}>
          + new row
        </button>
      )}
    </div>
  );
}
