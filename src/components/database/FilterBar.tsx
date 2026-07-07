import { useState } from "react";
import type { Database, DbSort, FilterCondition, FilterOp } from "../../types";
import {
  chipSummary,
  defaultOpFor,
  operatorsForType,
  valueKind,
} from "./filtering";

interface Props {
  db: Database;
  filters: FilterCondition[];
  sort: DbSort | null;
  onChangeFilters: (filters: FilterCondition[]) => void;
  onChangeSort: (sort: DbSort | null) => void;
}

let counter = 0;
const newId = () => `f${Date.now().toString(36)}${counter++}`;

export function FilterBar({ db, filters, sort, onChangeFilters, onChangeSort }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const addFilter = () => {
    const prop = db.properties[0];
    if (!prop) return;
    const cond: FilterCondition = {
      id: newId(),
      propId: prop.id,
      op: defaultOpFor(prop.type),
      value: "",
      values: [],
    };
    onChangeFilters([...filters, cond]);
    setOpenId(cond.id);
  };

  const update = (id: string, patch: Partial<FilterCondition>) =>
    onChangeFilters(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const remove = (id: string) => {
    onChangeFilters(filters.filter((f) => f.id !== id));
    setOpenId(null);
  };

  const changeProp = (id: string, propId: string) => {
    const prop = db.properties.find((p) => p.id === propId);
    if (!prop) return;
    // Reset operator + value to sensible defaults for the new property type.
    update(id, { propId, op: defaultOpFor(prop.type), value: "", values: [] });
  };

  return (
    <div className="db-controls">
      <div className="db-control">
        <span className="db-control-label">sort</span>
        <select
          className="db-control-select"
          value={sort?.propId ?? ""}
          onChange={(e) =>
            onChangeSort(
              e.target.value
                ? { propId: e.target.value, dir: sort?.dir ?? "asc" }
                : null
            )
          }
        >
          <option value="">none</option>
          {db.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {sort && (
          <button
            className="db-control-btn"
            title="Toggle direction"
            onClick={() =>
              onChangeSort({
                propId: sort.propId,
                dir: sort.dir === "asc" ? "desc" : "asc",
              })
            }
          >
            {sort.dir === "asc" ? "↑ asc" : "↓ desc"}
          </button>
        )}
      </div>

      <div className="filter-bar">
        <span className="db-control-label">filter</span>
        {filters.map((f) => (
          <FilterChip
            key={f.id}
            db={db}
            cond={f}
            open={openId === f.id}
            onToggle={() => setOpenId(openId === f.id ? null : f.id)}
            onClose={() => setOpenId(null)}
            onChangeProp={(pid) => changeProp(f.id, pid)}
            onChangeOp={(op) => update(f.id, { op })}
            onChangeValue={(value) => update(f.id, { value })}
            onChangeValues={(values) => update(f.id, { values })}
            onRemove={() => remove(f.id)}
          />
        ))}
        <button className="filter-add" onClick={addFilter}>
          + filter
        </button>
      </div>
    </div>
  );
}

interface ChipProps {
  db: Database;
  cond: FilterCondition;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChangeProp: (propId: string) => void;
  onChangeOp: (op: FilterOp) => void;
  onChangeValue: (value: string) => void;
  onChangeValues: (values: string[]) => void;
  onRemove: () => void;
}

function FilterChip({
  db,
  cond,
  open,
  onToggle,
  onClose,
  onChangeProp,
  onChangeOp,
  onChangeValue,
  onChangeValues,
  onRemove,
}: ChipProps) {
  const prop = db.properties.find((p) => p.id === cond.propId);
  if (!prop) return null;
  const ops = operatorsForType(prop.type);
  const kind = valueKind(cond.op, prop.type);
  const summary = chipSummary(cond, prop);

  return (
    <span className="filter-chip-wrap">
      <span className={`filter-chip${open ? " open" : ""}`} onClick={onToggle}>
        <span className="filter-chip-name">{prop.name}</span>
        {summary && <span className="filter-chip-val">: {summary}</span>}
        <span
          className="filter-chip-x"
          title="Remove filter"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          ×
        </span>
      </span>

      {open && (
        <>
          <div className="filter-pop-backdrop" onMouseDown={onClose} />
          <div className="filter-pop" onMouseDown={(e) => e.stopPropagation()}>
            <div className="filter-pop-head">
              <select
                className="filter-pop-select"
                value={cond.propId}
                onChange={(e) => onChangeProp(e.target.value)}
              >
                {db.properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                className="filter-pop-select"
                value={cond.op}
                onChange={(e) => onChangeOp(e.target.value as FilterOp)}
              >
                {ops.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button className="filter-pop-del" title="Remove filter" onClick={onRemove}>
                ×
              </button>
            </div>

            <div className="filter-pop-body">
              {kind === "text" && (
                <input
                  className="filter-pop-input"
                  placeholder="Type a value…"
                  value={cond.value ?? ""}
                  autoFocus
                  onChange={(e) => onChangeValue(e.target.value)}
                />
              )}
              {kind === "number" && (
                <input
                  type="number"
                  className="filter-pop-input"
                  placeholder="Value…"
                  value={cond.value ?? ""}
                  autoFocus
                  onChange={(e) => onChangeValue(e.target.value)}
                />
              )}
              {kind === "date" && (
                <input
                  type="date"
                  className="filter-pop-input filter-pop-date"
                  value={cond.value ?? ""}
                  onChange={(e) => onChangeValue(e.target.value)}
                />
              )}
              {kind === "select" && (
                <div className="filter-options">
                  {(prop.options ?? []).length === 0 && (
                    <span className="filter-hint">no options yet</span>
                  )}
                  {(prop.options ?? []).map((opt) => {
                    const checked = (cond.values ?? []).includes(opt.id);
                    return (
                      <label key={opt.id} className="filter-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const cur = cond.values ?? [];
                            onChangeValues(
                              checked ? cur.filter((x) => x !== opt.id) : [...cur, opt.id]
                            );
                          }}
                        />
                        <span className="filter-option-tag">{opt.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
              {kind === "none" && (
                <span className="filter-hint">no value needed</span>
              )}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
