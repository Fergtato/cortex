import { useEffect, useState } from "react";
import { PageFrame, useRouter, type CortexModule, type ModuleViewProps } from "@cortex/core";
import { Button, Grid, Panel, Sidebar, Stat } from "@cortex/ui";

/*
 * Home: the landing page and, from Phase 3, the customisable dashboards that
 * pull widgets from every module. For now an overview with a clock and a
 * jump-off panel per app.
 */

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function HomeSidebar(_: ModuleViewProps) {
  return <Sidebar title="Home" sections={[{ items: [{ id: "overview", label: "Overview", icon: "grid" }] }]} active="overview" />;
}

const APPS: { id: string; name: string; blurb: string; ready: boolean }[] = [
  { id: "notes", name: "Notes", blurb: "Pages and databases.", ready: true },
  { id: "finance", name: "Finance", blurb: "Accounts, spending and budgets.", ready: false },
  { id: "watchlist", name: "Watchlist", blurb: "Films and shows to watch.", ready: false },
  { id: "recipes", name: "Recipes", blurb: "Recipes and meal plans.", ready: false },
  { id: "health", name: "Health", blurb: "Workouts and health data.", ready: false },
];

function HomePage(_: ModuleViewProps) {
  const { navigate } = useRouter();
  const now = useNow();
  const time = now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <PageFrame crumbs={["Home", "Overview"]} canvas="dots" title={greeting} subtitle="Widgets from your apps will collect here.">
      <Grid>
        <Panel span={4} label="Local time" meta={date}>
          <Stat value={time} size="lg" />
        </Panel>
        <Panel span={8} label="Apps" meta={`${APPS.filter((a) => a.ready).length} of ${APPS.length} ready`} flush>
          <ul className="home-apps">
            {APPS.map((a) => (
              <li key={a.id}>
                <span className="home-apps__name">{a.name}</span>
                <span className="home-apps__blurb">{a.blurb}</span>
                {a.ready ? (
                  <Button size="sm" variant="ghost" iconRight="arrow-up-right" onClick={() => navigate(`/${a.id}`)}>
                    Open
                  </Button>
                ) : (
                  <span className="cx-label">Planned</span>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </Grid>
    </PageFrame>
  );
}

export const homeModule: CortexModule = {
  id: "home",
  name: "Home",
  icon: "grid",
  Sidebar: HomeSidebar,
  Page: HomePage,
};
