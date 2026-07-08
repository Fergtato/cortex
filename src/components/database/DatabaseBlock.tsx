import { useMemo } from "react";
import {
  VIEW_TYPES,
  type Database,
  type DatabaseRow,
  type ViewType,
} from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";
import { TableView } from "./TableView";
import { GalleryView } from "./GalleryView";
import { TimelineView } from "./TimelineView";
import { KanbanView } from "./KanbanView";
import { CalendarView } from "./CalendarView";
import { ChartView } from "./ChartView";
import { FilterBar } from "./FilterBar";
import { ExportControls } from "./ExportControls";
import { viewRows } from "./viewRows";

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
  chart: "▨",
};

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

  const rows: DatabaseRow[] = useMemo(
    () => viewRows(db, active),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.rows, db.properties, filters, sort]
  );

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
          // Grouping applies to table + kanban views.
          groupBy={
            active.type === "table" || active.type === "kanban"
              ? active.groupByPropId ?? null
              : undefined
          }
          onChangeGroupBy={(propId) =>
            store.updateView(db.id, active.id, { groupByPropId: propId })
          }
        />
      )}

      <div className="db-body">
        {active.type === "table" && (
          <TableView
            db={db}
            store={store}
            rows={rows}
            view={active}
            lockSchema={lockSchema}
            minimal={minimal}
          />
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
        {active.type === "calendar" && (
          <CalendarView
            db={db}
            store={store}
            rows={rows}
            view={active}
            lockSchema={lockSchema}
            minimal={minimal}
          />
        )}
        {active.type === "chart" && (
          <ChartView db={db} store={store} rows={rows} view={active} minimal={minimal} />
        )}
      </div>
    </div>
  );
}
