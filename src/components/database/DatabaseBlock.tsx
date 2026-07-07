import { useMemo, useState } from "react";
import {
  VIEW_TYPES,
  type Database,
  type DatabaseRow,
  type DbSort,
  type FilterCondition,
  type PropertyType,
  type ViewType,
} from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";
import { TableView } from "./TableView";
import { GalleryView } from "./GalleryView";
import { TimelineView } from "./TimelineView";
import { FilterBar } from "./FilterBar";
import { matchesAll } from "./filtering";
import { ExportControls } from "./ExportControls";

interface Props {
  db: Database;
  store: Store;
  /** When embedded in a page, the host provides its own name/remove header. */
  embedded?: boolean;
  /** Lock schema editing (properties + view add/delete); data stays editable. */
  lockSchema?: boolean;
  /** Per-embed filter/sort, persisted by the host. Presence shows the controls. */
  filters?: FilterCondition[];
  sort?: DbSort | null;
  onChangeFilters?: (f: FilterCondition[]) => void;
  onChangeSort?: (s: DbSort | null) => void;
}

const VIEW_ICON: Record<ViewType, string> = {
  table: "▦",
  gallery: "▤",
  timeline: "▭",
  kanban: "▥",
  calendar: "▧",
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
  filters = [],
  sort = null,
  onChangeFilters,
  onChangeSort,
}: Props) {
  const dialog = useDialog();
  const showControls = Boolean(onChangeFilters && onChangeSort);

  // Embeds track the active view locally so switching never mutates the source.
  const [localViewId, setLocalViewId] = useState(db.activeViewId);
  const activeViewId = lockSchema ? localViewId : db.activeViewId;
  const active = db.views.find((v) => v.id === activeViewId) ?? db.views[0];
  const selectView = (id: string) =>
    lockSchema ? setLocalViewId(id) : store.setActiveView(db.id, id);

  const rows: DatabaseRow[] = useMemo(() => {
    let out = filters.length ? db.rows.filter((r) => matchesAll(db, r, filters)) : db.rows;
    if (sort && sort.propId) {
      const prop = db.properties.find((p) => p.id === sort.propId);
      out = [...out].sort((a, b) => {
        const c = compareCells(a.cells[sort.propId], b.cells[sort.propId], prop?.type);
        return sort.dir === "asc" ? c : -c;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.rows, db.properties, filters, sort]);

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
          <ExportControls db={db} />
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
        <FilterBar
          db={db}
          filters={filters}
          sort={sort}
          onChangeFilters={onChangeFilters!}
          onChangeSort={onChangeSort!}
        />
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
