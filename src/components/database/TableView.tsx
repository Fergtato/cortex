import { Fragment, useState } from "react";
import {
  PROPERTY_TYPES,
  type AggOp,
  type Database,
  type DatabaseRow,
  type DatabaseView,
  type PropertyDef,
} from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";
import { Cell } from "./Cell";
import { computedCellValue } from "../../lib/formula";
import { AGG_OPS, aggregate } from "./aggregate";

interface Props {
  db: Database;
  store: Store;
  /** Rows to display (already filtered/sorted by the host). */
  rows: DatabaseRow[];
  view: DatabaseView;
  /** Hide schema-editing controls (property name/type/delete, add property). */
  lockSchema?: boolean;
  /** Minimal chrome: hide the new-row button, row-delete column, calc row. */
  minimal?: boolean;
}

const UNGROUPED = "__none__";

export function TableView({ db, store, rows, view, lockSchema, minimal }: Props) {
  const dialog = useDialog();
  // Column drag state (header handles reorder via store.reorderProperties).
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const canWrap = (type: string) => type === "text" || type === "url";

  const aggs = view.aggregations ?? {};
  const hasAggs = db.properties.some((p) => aggs[p.id]);
  const colSpan = db.properties.length + (minimal ? 0 : 1);

  const groupProp = db.properties.find(
    (p) => p.id === view.groupByPropId && p.type === "select"
  );
  const groups = groupProp
    ? [
        ...(groupProp.options ?? []).map((o) => ({
          key: o.id,
          label: o.name,
          color: o.color as string | null,
          rows: rows.filter((r) => r.cells[groupProp.id] === o.id),
        })),
        {
          key: UNGROUPED,
          label: `no ${groupProp.name.toLowerCase()}`,
          color: null,
          rows: rows.filter(
            (r) =>
              !r.cells[groupProp.id] ||
              !(groupProp.options ?? []).some((o) => o.id === r.cells[groupProp.id])
          ),
        },
      ].filter((g) => g.rows.length > 0 || g.key !== UNGROUPED)
    : null;

  const toggleGroup = (key: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const colValues = (prop: PropertyDef, over: DatabaseRow[]) =>
    over.map((r) => computedCellValue(db, r, prop));

  const setAgg = (propId: string, op: string) => {
    const next = { ...aggs };
    if (op) next[propId] = op as AggOp;
    else delete next[propId];
    store.updateView(db.id, view.id, { aggregations: next });
  };

  const renderRow = (row: DatabaseRow) => (
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
  );

  const renderAggRow = (over: DatabaseRow[], className: string) => (
    <tr className={className}>
      {db.properties.map((prop) => (
        <td key={prop.id} className="agg-cell">
          {aggs[prop.id] && (
            <span className="agg-val">
              <span className="agg-op">{aggs[prop.id]}</span>{" "}
              {aggregate(aggs[prop.id], colValues(prop, over))}
            </span>
          )}
        </td>
      ))}
      {!minimal && <td />}
    </tr>
  );

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
          {groups
            ? groups.map((g) => (
                <Fragment key={g.key}>
                  <tr className="tgroup-row">
                    <td colSpan={colSpan}>
                      <button
                        className="tgroup-toggle"
                        onClick={() => toggleGroup(g.key)}
                      >
                        {collapsed.has(g.key) ? "▸" : "▾"}
                      </button>
                      {g.color ? (
                        <span className={`cell-pill selc-${g.color}`}>{g.label}</span>
                      ) : (
                        <span className="tgroup-none">{g.label}</span>
                      )}
                      <span className="tgroup-count">{g.rows.length}</span>
                    </td>
                  </tr>
                  {!collapsed.has(g.key) && g.rows.map(renderRow)}
                  {!collapsed.has(g.key) && hasAggs && renderAggRow(g.rows, "tgroup-agg")}
                </Fragment>
              ))
            : rows.map(renderRow)}
        </tbody>
        {!minimal && (
          <tfoot>
            <tr className="agg-row">
              {db.properties.map((prop) => (
                <td key={prop.id} className="agg-cell">
                  <span className="agg-pick">
                    <select
                      className="agg-select"
                      value={aggs[prop.id] ?? ""}
                      title="Column calculation"
                      onChange={(e) => setAgg(prop.id, e.target.value)}
                    >
                      <option value="">calc</option>
                      {AGG_OPS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    {aggs[prop.id] && (
                      <span className="agg-val">
                        {aggregate(aggs[prop.id], colValues(prop, rows))}
                      </span>
                    )}
                  </span>
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
      {!minimal && (
        <button className="add-row-btn" onClick={() => store.addRow(db.id)}>
          + new row
        </button>
      )}
    </div>
  );
}
