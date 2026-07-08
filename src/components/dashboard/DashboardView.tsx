import type { Dashboard } from "../../types";
import type { Store } from "../../store";

interface Props {
  dash: Dashboard;
  store: Store;
}

/**
 * Main-pane renderer for a dashboard: a bento grid of widgets with a
 * view/edit toggle. Stage 1 ships the shell; the grid arrives in Stage 2.
 */
export function DashboardView({ dash }: Props) {
  return (
    <div className="dash-view">
      <div className="dash-empty">
        <pre className="ascii">{`
   ┌──────────────────────────────┐
   │  ${(dash.name || "dashboard").padEnd(28).slice(0, 28)}│
   │  widget grid coming soon     │
   └──────────────────────────────┘
`}</pre>
      </div>
    </div>
  );
}
