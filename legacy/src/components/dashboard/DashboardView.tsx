import { useState } from "react";
import type { Dashboard } from "../../types";
import type { Store } from "../../store";
import { Icon, isIconName } from "../Icon";
import { IconPicker } from "../IconPicker";
import { DashboardGrid } from "./DashboardGrid";

interface Props {
  dash: Dashboard;
  store: Store;
}

/**
 * Main-pane renderer for a dashboard: a slim toolbar (view/edit toggle and,
 * in edit mode, grid controls + sidebar-icon picker) above the bento grid.
 * Dashboards render no in-body title — the name lives in the sidebar.
 */
export function DashboardView({ dash, store }: Props) {
  const [editing, setEditing] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  // A grid axis can't shrink below the space widgets already occupy.
  const minCols = Math.max(1, ...dash.widgets.map((w) => w.x + w.w));
  const minRows = Math.max(1, ...dash.widgets.map((w) => w.y + w.h));

  const patch = (p: Partial<Dashboard>) =>
    store.updateDashboard(dash.id, (d) => ({ ...d, ...p }));

  return (
    <div className="dash-view">
      <div className="dash-toolbar">
        <span className="breadcrumb dash-crumb">
          <span className="crumb-static">dashboards</span>
          <span className="crumb-sep"> / </span>
          <span className="crumb-static">
            {isIconName(dash.icon) && (
              <Icon name={dash.icon} size={12} color={dash.iconColor} />
            )}{" "}
            {dash.name || "untitled"}
          </span>
        </span>

        <span className="dash-toolbar-actions">
          {editing && (
            <>
              <span className="dash-dim-ctrl" title="Grid columns">
                <button
                  className="row-btn"
                  disabled={dash.columns <= minCols}
                  onClick={() => patch({ columns: dash.columns - 1 })}
                >
                  −
                </button>
                <span className="dash-dim-label">{dash.columns}c</span>
                <button
                  className="row-btn"
                  disabled={dash.columns >= 24}
                  onClick={() => patch({ columns: dash.columns + 1 })}
                >
                  +
                </button>
              </span>
              <span className="dash-dim-ctrl" title="Grid rows">
                <button
                  className="row-btn"
                  disabled={dash.rows <= minRows}
                  onClick={() => patch({ rows: dash.rows - 1 })}
                >
                  −
                </button>
                <span className="dash-dim-label">{dash.rows}r</span>
                <button
                  className="row-btn"
                  disabled={dash.rows >= 24}
                  onClick={() => patch({ rows: dash.rows + 1 })}
                >
                  +
                </button>
              </span>
              <button
                className="meta-btn"
                title="Fit fills the screen; scroll grows downward"
                onClick={() => patch({ sizing: dash.sizing === "fit" ? "scroll" : "fit" })}
              >
                {dash.sizing === "fit" ? "⤢ fit" : "↕ scroll"}
              </button>
              <span className="dash-icon-wrap">
                <button
                  className="meta-btn"
                  title="Sidebar icon"
                  onClick={() => setIconOpen((o) => !o)}
                >
                  {isIconName(dash.icon) ? (
                    <Icon name={dash.icon} size={12} color={dash.iconColor} />
                  ) : (
                    "◧"
                  )}{" "}
                  icon
                </button>
                {iconOpen && (
                  <IconPicker
                    current={dash.icon}
                    currentColor={dash.iconColor}
                    onPick={(icon) => patch({ icon })}
                    onPickColor={(iconColor) => patch({ iconColor })}
                    onClose={() => setIconOpen(false)}
                  />
                )}
              </span>
            </>
          )}
          <button
            className={`row-btn db-embed-edit${editing ? " active" : ""}`}
            onClick={() => {
              setIconOpen(false);
              setEditing((e) => !e);
            }}
          >
            {editing ? "✓ done" : "✎ edit"}
          </button>
        </span>
      </div>

      <div className={`dash-grid-wrap dash-${dash.sizing}`}>
        <DashboardGrid dash={dash} store={store} editing={editing} />
      </div>

      {!editing && dash.widgets.length === 0 && (
        <div className="dash-empty-hint">empty dashboard — hit ✎ edit to add widgets</div>
      )}
    </div>
  );
}
