import { useState, type ReactNode } from "react";
import { PageFrame } from "@cortex/core";
import { Button, Segmented } from "@cortex/ui";
import { LazyIcon, LazyIconPicker } from "@cortex/icons/lazy";
import type { Dashboard } from "../types";
import type { DashStore } from "../store";
import { DashboardGrid } from "./DashboardGrid";

interface Props {
  dash: Dashboard;
  store: DashStore;
  crumbs: ReactNode[];
}

/** − n + stepper for a grid dimension. */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <span className="dash-stepper" title={label}>
      <Button size="sm" variant="ghost" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </Button>
      <span className="dash-stepper-value">
        {value}
        <span className="dash-stepper-unit">{label === "columns" ? "C" : "R"}</span>
      </span>
      <Button size="sm" variant="ghost" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </Button>
    </span>
  );
}

/**
 * A dashboard: the topbar carries the edit toggle and, while editing, the
 * grid controls (columns, rows, fit/scroll, sidebar icon). The canvas switches
 * to the dot grid in edit mode, as the design system specifies.
 */
export function DashboardView({ dash, store, crumbs }: Props) {
  const [editing, setEditing] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  // A grid axis can't shrink below the space widgets already occupy.
  const minCols = Math.max(1, ...dash.widgets.map((w) => w.x + w.w));
  const minRows = Math.max(1, ...dash.widgets.map((w) => w.y + w.h));
  const patch = (p: Partial<Dashboard>) => store.updateDashboard(dash.id, (d) => ({ ...d, ...p }));

  const actions = (
    <>
      {editing && (
        <>
          <Stepper label="columns" value={dash.columns} min={minCols} max={24} onChange={(columns) => patch({ columns })} />
          <Stepper label="rows" value={dash.rows} min={minRows} max={24} onChange={(rows) => patch({ rows })} />
          <Segmented
            size="sm"
            aria-label="Sizing"
            options={[
              { value: "fit", label: "Fit" },
              { value: "scroll", label: "Scroll" },
            ]}
            value={dash.sizing}
            onChange={(v) => patch({ sizing: v as Dashboard["sizing"] })}
          />
          <span className="dash-icon-wrap">
            <Button size="sm" variant="ghost" onClick={() => setIconOpen((o) => !o)} title="Sidebar icon">
              {dash.icon ? <LazyIcon name={dash.icon} size={14} color={dash.iconColor} /> : "Icon"}
            </Button>
            {iconOpen && (
              <LazyIconPicker
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
      <Button
        size="sm"
        variant={editing ? "primary" : "secondary"}
        icon={editing ? "check" : undefined}
        bracket={editing}
        onClick={() => {
          setIconOpen(false);
          setEditing((e) => !e);
        }}
      >
        {editing ? "Done" : "Edit"}
      </Button>
    </>
  );

  return (
    <PageFrame crumbs={crumbs} actions={actions} canvas={editing ? "dots" : "plain"}>
      <div className={`home-root dash-view dash-${dash.sizing}`}>
        <DashboardGrid dash={dash} store={store} editing={editing} />
        {!editing && dash.widgets.length === 0 && (
          <div className="dash-empty">
            <p className="cx-label">Empty dashboard</p>
            <p>Add widgets from your apps to see everything in one place.</p>
            <Button variant="primary" icon="plus" onClick={() => setEditing(true)}>
              Add widgets
            </Button>
          </div>
        )}
      </div>
    </PageFrame>
  );
}
