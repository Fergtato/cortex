import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { newId, PageFrame, useRouter, type CortexModule, type ModuleViewProps } from "@cortex/core";
import { Button, Grid, Panel, Sidebar } from "@cortex/ui";
import "./home.css";
import { useDashStore, type DashStore } from "./store";
import { buildDashRoutes } from "./routes";
import { DashboardTree } from "./components/DashboardTree";
import { DashboardView } from "./components/DashboardView";
import { HOME_WIDGETS } from "./widgets";
import { homeBackup } from "./backup";
import { DashContext } from "./context";

/*
 * Home: customisable dashboards that pull widgets from every module. `/` shows
 * the first dashboard; others live at /home/<folder>/<name>.
 */

const BASE = "/home";


export function useDashboards(): DashStore {
  const ctx = useContext(DashContext);
  if (!ctx) throw new Error("useDashboards must be used within the Home Provider");
  return ctx;
}

/** Last dashboard the URL resolved to: a rename makes the path stale for a moment. */
const LastDash = createContext<{ current: string | null }>({ current: null });

function HomeProvider({ children }: { children: ReactNode }) {
  const store = useDashStore();
  const last = useRef<string | null>(null);
  return (
    <DashContext.Provider value={store}>
      <LastDash.Provider value={last}>{children}</LastDash.Provider>
    </DashContext.Provider>
  );
}

function useRoutes() {
  const store = useDashboards();
  return useMemo(() => buildDashRoutes(store.map), [store.map]);
}

/** The dashboard for the current URL: `/` = the first one; a stale path keeps the last one. */
function useCurrentDashboard(subpath: string): string | null {
  const store = useDashboards();
  const routes = useRoutes();
  const last = useContext(LastDash);
  return useMemo(() => {
    if (subpath === "/") return (last.current = store.dashboards[0]?.id ?? null);
    const hit = routes.byPath.get(subpath.toLowerCase());
    if (hit) return (last.current = hit);
    return last.current && store.getDashboard(last.current) ? last.current : null;
  }, [subpath, routes, store, last]);
}

function HomeSidebar({ subpath }: ModuleViewProps) {
  const store = useDashboards();
  const routes = useRoutes();
  const { navigate } = useRouter();
  const current = useCurrentDashboard(subpath);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);

  // A new dashboard has no route until the store re-renders.
  useEffect(() => {
    if (pendingOpen && routes.pathOf.has(pendingOpen)) {
      navigate(BASE + routes.pathOf.get(pendingOpen)!);
      setPendingOpen(null);
    }
  }, [pendingOpen, routes, navigate]);

  return (
    <Sidebar
      title="Home"
      className="notes-side"
      actions={
        <>
          <Button size="sm" variant="ghost" icon="archive" aria-label="New folder" title="New folder" onClick={() => setRenamingId(store.createDashFolder())} />
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            aria-label="New dashboard"
            title="New dashboard"
            onClick={() => {
              const id = store.createDashboard();
              setRenamingId(id);
              setPendingOpen(id);
            }}
          />
        </>
      }
    >
      <div className="notes-side-head">
        <span className="cx-label">Dashboards</span>
      </div>
      {store.loaded && (
        <DashboardTree
          store={store}
          selectedId={current}
          onOpenDashboard={(id) => {
            const p = routes.pathOf.get(id);
            if (p) navigate(BASE + p);
          }}
          renamingId={renamingId}
          onRenameEnd={() => setRenamingId(null)}
        />
      )}
    </Sidebar>
  );
}

/** First-run: a short intro and a starter dashboard (clock + a note). */
function Welcome({ onCreate }: { onCreate: () => void }) {
  return (
    <PageFrame crumbs={["Home"]} title="Welcome to Cortex" subtitle="Home brings widgets from all your apps onto dashboards you arrange.">
      <Grid>
        <Panel span={8} label="Get started">
          <div className="dash-welcome">
            <p>Create a dashboard, then press Edit to add widgets: clocks, notes, database views, metrics, habit trackers, charts and live data from your connected APIs.</p>
            <div>
              <Button variant="primary" icon="plus" bracket onClick={onCreate}>
                Create dashboard
              </Button>
            </div>
          </div>
        </Panel>
        <Panel span={4} label="Moving from Cortex v0?">
          <p className="dash-welcome-note">Import your v0 backup in Settings, Backup. Pages, databases and dashboards come across together.</p>
        </Panel>
      </Grid>
    </PageFrame>
  );
}

function HomePage({ subpath }: ModuleViewProps) {
  const store = useDashboards();
  const routes = useRoutes();
  const { navigate } = useRouter();
  const id = useCurrentDashboard(subpath);
  const dash = id ? store.getDashboard(id) : undefined;

  // Renames and moves change the path: rewrite the address bar in place.
  const canonical = id && subpath !== "/" ? routes.pathOf.get(id) : undefined;
  useEffect(() => {
    if (canonical && canonical !== subpath) navigate(BASE + canonical, { replace: true });
  }, [canonical, subpath, navigate]);

  useEffect(() => {
    document.title = dash ? `${dash.name || "Untitled"} · Cortex` : "Cortex";
  }, [dash?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  if (store.loadError) {
    return (
      <PageFrame crumbs={["Home"]} title="Couldn't load dashboards" subtitle={store.loadError}>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </PageFrame>
    );
  }
  if (!store.loaded) return <PageFrame crumbs={["Home"]} />;

  if (!dash) {
    if (store.dashboards.length === 0) {
      return (
        <Welcome
          onCreate={() =>
            store.createDashboard({
              name: "Today",
              widgets: [
                { id: newId(), type: "clock", x: 0, y: 0, w: 4, h: 3, config: { h24: true, seconds: false, date: true } },
                {
                  id: newId(),
                  type: "text",
                  x: 4,
                  y: 0,
                  w: 8,
                  h: 3,
                  config: { text: "Press Edit to arrange this dashboard and add widgets from your apps.", align: "left", valign: "top", size: "m", color: null },
                },
              ],
            })
          }
        />
      );
    }
    return (
      <PageFrame crumbs={["Home", "Not found"]} title="Not found" subtitle="This dashboard doesn't exist. It may have been renamed or deleted.">
        <Button variant="secondary" onClick={() => navigate("/")}>
          Go home
        </Button>
      </PageFrame>
    );
  }

  const folder = dash.folderId ? store.map[dash.folderId] : undefined;
  return <DashboardView key={dash.id} dash={dash} store={store} crumbs={["Home", ...(folder ? [folder.name] : []), dash.name || "Untitled"]} />;
}

export const homeModule: CortexModule = {
  id: "home",
  name: "Home",
  icon: "grid",
  Provider: HomeProvider,
  Sidebar: HomeSidebar,
  Page: HomePage,
  widgets: HOME_WIDGETS,
  backup: homeBackup,
};
