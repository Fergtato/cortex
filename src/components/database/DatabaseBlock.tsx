import { useMemo, useState } from "react";
import {
  VIEW_TYPES,
  type Database,
  type DatabaseRow,
  type DbFilter,
  type DbSort,
  type PropertyType,
  type ViewType,
} from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";
import { TableView } from "./TableView";
import { GalleryView } from "./GalleryView";
import { TimelineView } from "./TimelineView";

interface Props {
  db: Database;
  store: Store;
  /** When embedded in a page, the host provides its own name/remove header. */
  embedded?: boolean;
  /** Lock schema editing (properties + view add/delete); data stays editable. */
  lockSchema?: boolean;
  /** Per-embed filter/sort, persisted by the host. Presence shows the controls. */
  filter?: DbFilter | null;
  sort?: DbSort | null;
  onChangeFilter?: (f: DbFilter | null) => void;
  onChangeSort?: (s: DbSort | null) => void;
}

const VIEW_ICON: Record<ViewType, string> = {
  table: "▦",
  gallery: "▤",
  timeline: "▭",
};

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "";
}

function compareCells(a: unknown, b: unknown, type?: PropertyType): number {
  const ae = isEmpty(a);
  const be = isEmpty(b);
  if (ae && be) return 0;
  if (ae) return 1; // empties sort last
  if (be) return -1;
  if (type === "number") return Number(a) - Number(b);
  if (type === "date") return new Date(String(a)).getTime() - new Date(String(b)).getTime();
  if (type === "checkbox") return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  return String(a).localeCompare(String(b));
}

export function DatabaseBlock({
  db,
  store,
  embedded = false,
  lockSchema = false,
  filter = null,
  sort = null,
  onChangeFilter,
  onChangeSort,
}: Props) {
  const dialog = useDialog();
  const showControls = Boolean(onChangeFilter && onChangeSort);

  // Embeds track the active view locally so switching never mutates the source.
  const [localViewId, setLocalViewId] = useState(db.activeViewId);
  const activeViewId = lockSchema ? localViewId : db.activeViewId;
  const active = db.views.find((v) => v.id === activeViewId) ?? db.views[0];
  const selectView = (id: string) =>
    lockSchema ? setLocalViewId(id) : store.setActiveView(db.id, id);

  const rows: DatabaseRow[] = useMemo(() => {
    let out = db.rows;
    if (filter && filter.propId && filter.query.trim()) {
      const prop = db.properties.find((p) => p.id === filter.propId);
      const q = filter.query.trim().toLowerCase();
      out = out.filter((r) => {
        const v = r.cells[filter.propId];
        if (prop?.type === "checkbox") {
          const yes = ["true", "yes", "✓", "done", "checked"].includes(q);
          return (v === true) === yes;
        }
        return String(v ?? "").toLowerCase().includes(q);
      });
    }
    if (sort && sort.propId) {
      const prop = db.properties.find((p) => p.id === sort.propId);
      out = [...out].sort((a, b) => {
        const c = compareCells(a.cells[sort.propId], b.cells[sort.propId], prop?.type);
        return sort.dir === "asc" ? c : -c;
      });
    }
    return out;
  }, [db.rows, db.properties, filter, sort]);

  async function renameViewPrompt(viewId: string, current: string) {
    const name = await dialog.prompt("Rename view:", current);
    if (name && name.trim()) store.renameView(db.id, viewId, name.trim());
  }

  return (
    <div className="db-block">
      {!embedded && (
        <div className="db-head">
          <input
            className="db-name"
            value={db.name}
            onChange={(e) => store.renameDatabase(db.id, e.target.value)}
          />
          <button
            className="db-del"
            title="Delete database"
            onClick={async () => {
              const ok = await dialog.confirm(`Delete database "${db.name}"?`, {
                confirmLabel: "delete",
                danger: true,
              });
              if (ok) store.deleteDatabase(db.id);
            }}
          >
            delete db ×
          </button>
        </div>
      )}

      <div className="db-views">
        {db.views.map((v) => (
          <div
            key={v.id}
            className={`view-tab${v.id === activeViewId ? " active" : ""}`}
            title={lockSchema ? undefined : "double-click to rename"}
            onClick={() => selectView(v.id)}
            onDoubleClick={() => {
              if (!lockSchema) renameViewPrompt(v.id, v.name);
            }}
          >
            <span className="view-icon">{VIEW_ICON[v.type]}</span>
            {v.name}
            {!lockSchema && db.views.length > 1 && (
              <button
                className="view-del"
                title="Remove view"
                onClick={(e) => {
                  e.stopPropagation();
                  store.deleteView(db.id, v.id);
                }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {!lockSchema && (
          <select
            className="view-add"
            value=""
            title="Add view"
            onChange={(e) => {
              if (e.target.value) store.addView(db.id, e.target.value as ViewType);
            }}
          >
            <option value="">+ view</option>
            {VIEW_TYPES.map((t) => (
              <option key={t} value={t}>
                {VIEW_ICON[t]} {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {showControls && (
        <div className="db-controls">
          <div className="db-control">
            <span className="db-control-label">sort</span>
            <select
              className="db-control-select"
              value={sort?.propId ?? ""}
              onChange={(e) =>
                onChangeSort!(
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
                  onChangeSort!({
                    propId: sort.propId,
                    dir: sort.dir === "asc" ? "desc" : "asc",
                  })
                }
              >
                {sort.dir === "asc" ? "↑ asc" : "↓ desc"}
              </button>
            )}
          </div>

          <div className="db-control">
            <span className="db-control-label">filter</span>
            <select
              className="db-control-select"
              value={filter?.propId ?? ""}
              onChange={(e) =>
                onChangeFilter!(
                  e.target.value
                    ? { propId: e.target.value, query: filter?.query ?? "" }
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
            {filter?.propId && (
              <>
                <input
                  className="db-control-input"
                  placeholder="contains…"
                  value={filter.query}
                  onChange={(e) =>
                    onChangeFilter!({ propId: filter.propId, query: e.target.value })
                  }
                />
                <button
                  className="db-control-btn"
                  title="Clear filter"
                  onClick={() => onChangeFilter!(null)}
                >
                  ×
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="db-body">
        {active.type === "table" && (
          <TableView db={db} store={store} rows={rows} lockSchema={lockSchema} />
        )}
        {active.type === "gallery" && (
          <GalleryView db={db} store={store} rows={rows} />
        )}
        {active.type === "timeline" && (
          <TimelineView db={db} store={store} rows={rows} lockSchema={lockSchema} />
        )}
      </div>
    </div>
  );
}
