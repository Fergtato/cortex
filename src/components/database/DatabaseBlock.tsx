import { useMemo } from "react";
import {
  VIEW_TYPES,
  type Database,
  type DatabaseRow,
  type PropertyDef,
  type ViewType,
} from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";
import { TableView } from "./TableView";
import { GalleryView } from "./GalleryView";
import { TimelineView } from "./TimelineView";
import { KanbanView } from "./KanbanView";
import { FilterBar } from "./FilterBar";
import { matchesAll } from "./filtering";
import { ExportControls } from "./ExportControls";
import { computedCellValue } from "../../lib/formula";

interface Props {
  db: Database;
  store: Store;
  /** When embedded in a page, the host provides its own name/remove header. */
  embedded?: boolean;
  /** Lock schema editing (properties + view add/delete); data stays editable. */
  lockSchema?: boolean;
  /** Minimal chrome: hide view tabs, filter/sort bar, and new-row controls. */
  minimal?: boolean;
  /** Controlled active view (embeds persist their own choice). */
  viewId?: string | null;
  onSelectView?: (id: string) => void;
}

const VIEW_ICON: Record<ViewType, string> = {
  table: "▦",
  gallery: "▤",
  timeline: "▭",
  kanban: "▥",
  calendar: "▧",
};

function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/** Sort key for a cell; select values sort by option *name*, not id. */
function sortKey(v: unknown, prop?: PropertyDef): unknown {
  if (!prop) return v;
  if (prop.type === "select" && typeof v === "string") {
    return prop.options?.find((o) => o.id === v)?.name ?? v;
  }
  if (prop.type === "multiselect" && Array.isArray(v)) {
    return v
      .map((id) => prop.options?.find((o) => o.id === id)?.name ?? id)
      .join(", ");
  }
  return v;
}

export function compareCells(a: unknown, b: unknown, prop?: PropertyDef): number {
  const ae = isEmpty(a);
  const be = isEmpty(b);
  if (ae && be) return 0;
  if (ae) return 1; // empties sort last
  if (be) return -1;
  const type = prop?.type;
  if (
    type === "number" ||
    type === "auto_id" ||
    type === "created_time" ||
    type === "last_edited_time"
  ) {
    return Number(a) - Number(b);
  }
  if (type === "date") return new Date(String(a)).getTime() - new Date(String(b)).getTime();
  if (type === "checkbox") return (a === true ? 1 : 0) - (b === true ? 1 : 0);
  // Formulas: numeric when both sides are numeric, string otherwise.
  if (type === "formula" && typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  const ka = sortKey(a, prop);
  const kb = sortKey(b, prop);
  return String(ka).localeCompare(String(kb));
}

export function DatabaseBlock({
  db,
  store,
  embedded = false,
  lockSchema = false,
  minimal = false,
  viewId = null,
  onSelectView,
}: Props) {
  const dialog = useDialog();

  // Embeds control their own active view (persisted on the embed node) so
  // switching in one place never changes what other pages show.
  const activeViewId = embedded ? viewId ?? db.activeViewId : db.activeViewId;
  const active = db.views.find((v) => v.id === activeViewId) ?? db.views[0];
  const selectView = (id: string) =>
    embedded ? onSelectView?.(id) : store.setActiveView(db.id, id);

  // View-owned config — shared everywhere this view is shown.
  const filters = active.filters ?? [];
  const sort = active.sort ?? null;

  const rows: DatabaseRow[] = useMemo(() => {
    let out = filters.length ? db.rows.filter((r) => matchesAll(db, r, filters)) : db.rows;
    if (sort && sort.propId) {
      const prop = db.properties.find((p) => p.id === sort.propId);
      out = [...out].sort((a, b) => {
        const av = prop ? computedCellValue(db, a, prop) : a.cells[sort.propId];
        const bv = prop ? computedCellValue(db, b, prop) : b.cells[sort.propId];
        const c = compareCells(av, bv, prop);
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

      {!minimal && (
        <div className="db-views">
          {db.views.map((v) => (
            <div
              key={v.id}
              className={`view-tab${v.id === active.id ? " active" : ""}`}
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
      )}

      {!minimal && (
        <FilterBar
          db={db}
          filters={filters}
          sort={sort}
          onChangeFilters={(f) => store.updateView(db.id, active.id, { filters: f })}
          onChangeSort={(s) => store.updateView(db.id, active.id, { sort: s })}
        />
      )}

      <div className="db-body">
        {active.type === "table" && (
          <TableView db={db} store={store} rows={rows} lockSchema={lockSchema} minimal={minimal} />
        )}
        {active.type === "gallery" && (
          <GalleryView db={db} store={store} rows={rows} view={active} minimal={minimal} />
        )}
        {active.type === "timeline" && (
          <TimelineView db={db} store={store} rows={rows} lockSchema={lockSchema} minimal={minimal} />
        )}
        {active.type === "kanban" && (
          <KanbanView
            db={db}
            store={store}
            rows={rows}
            view={active}
            lockSchema={lockSchema}
            minimal={minimal}
          />
        )}
      </div>
    </div>
  );
}
