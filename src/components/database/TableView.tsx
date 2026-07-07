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
  return (
    <div className="db-table-wrap">
      <table className="db-table">
        <thead>
          <tr>
            {db.properties.map((prop, i) => (
              <th key={prop.id}>
                {lockSchema ? (
                  <div className="th-inner">
                    <span className="th-name-ro">{prop.name}</span>
                  </div>
                ) : (
                  <div className="th-inner">
                    <input
                      className="th-name"
                      value={prop.name}
                      onChange={(e) =>
                        store.updateProperty(db.id, prop.id, { name: e.target.value })
                      }
                    />
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
                <td key={prop.id}>
                  <Cell
                    prop={prop}
                    value={row.cells[prop.id] ?? null}
                    onChange={(v) => store.updateCell(db.id, row.id, prop.id, v)}
                    onAddOption={(name) => store.addSelectOption(db.id, prop.id, name)}
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
