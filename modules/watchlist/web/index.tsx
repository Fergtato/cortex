import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, PageFrame, type CortexModule, type ModuleBackup, type ModuleViewProps, type WidgetDef, type WidgetProps } from "@cortex/core";
import { useLibrary } from "./data";

/*
 * Watchlist: movies and TV from TMDB (one instance key, kept on the server),
 * quick add from any poster, episode tracking, stats, custom lists. Views and
 * widgets are lazy so Home stays light.
 */

const views = () => import("./views");
const LazySidebar = lazy(() => views().then((m) => ({ default: m.WatchlistSidebar })));
const LazyPage = lazy(() => views().then((m) => ({ default: m.WatchlistPage })));
const LazySettings = lazy(() => import("./settings").then((m) => ({ default: m.WatchlistSettings })));

function withSuspense<P extends object>(C: ComponentType<P>, fallback: ReactNode = null) {
  return (props: P) => (
    <Suspense fallback={fallback}>
      <C {...props} />
    </Suspense>
  );
}

type W = typeof import("./widgets");
const L = (name: keyof W) => lazy(() => import("./widgets").then((m) => ({ default: m[name] as ComponentType<WidgetProps> })));

const widgets: WidgetDef[] = [
  { type: "watchlist.continue", label: "Continue watching", icon: "film", defaultSize: { w: 6, h: 3 }, defaultConfig: {}, Component: L("ContinueWidget") },
  { type: "watchlist.upcoming", label: "Upcoming episodes", icon: "calendar", defaultSize: { w: 4, h: 3 }, defaultConfig: { limit: 6 }, Component: L("UpcomingWidget") },
  { type: "watchlist.queue", label: "Watchlist", icon: "bell", defaultSize: { w: 6, h: 3 }, defaultConfig: {}, Component: L("QueueWidget") },
  { type: "watchlist.stats", label: "Watch time", icon: "clock", defaultSize: { w: 3, h: 2 }, defaultConfig: { period: "week" }, Component: L("StatsWidget"), ConfigForm: L("StatsConfig") },
];

interface WatchlistBackup {
  entries?: unknown[];
  events?: unknown[];
  lists?: unknown[];
  items?: unknown[];
}

const backup: ModuleBackup = {
  useBackup: () => {
    const lib = useLibrary();
    const qc = useQueryClient();
    return {
      ready: lib.isSuccess,
      summary: lib.data ? `${lib.data.entries.length} titles · ${lib.data.lists.length} lists` : "",
      exportData: () => api<WatchlistBackup>("/watchlist/backup"),
      importData: async (data, mode) => {
        await api("/watchlist/backup", { method: "POST", json: { mode, data } });
        await qc.invalidateQueries({ queryKey: ["watchlist"] });
      },
    };
  },
  describe: (data) => {
    const d = data as WatchlistBackup;
    return `${d?.entries?.length ?? 0} titles · ${d?.events?.length ?? 0} watches`;
  },
};

export const watchlistModule: CortexModule = {
  id: "watchlist",
  name: "Watchlist",
  icon: "film",
  Sidebar: withSuspense<ModuleViewProps>(LazySidebar, <aside className="cx-side" />),
  Page: withSuspense<ModuleViewProps>(LazyPage, <PageFrame crumbs={["Watchlist"]} />),
  widgets,
  backup,
  settings: [{ id: "tmdb", label: "Watchlist", icon: "film", Component: withSuspense(LazySettings, <PageFrame crumbs={["Settings", "Watchlist"]} />) }],
};
