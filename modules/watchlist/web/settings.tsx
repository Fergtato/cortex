import { useQueryClient } from "@tanstack/react-query";
import { api, PageFrame } from "@cortex/core";
import { Badge, Button, Grid, Panel } from "@cortex/ui";
import { useConfig } from "./data";
import { TmdbKeyForm } from "./views";

const REGIONS = ["GB", "US", "IE", "CA", "AU", "NZ", "DE", "FR", "ES", "IT", "NL", "SE", "NO", "DK", "JP", "IN"];

/** Settings → Watchlist: the instance's TMDB key (admins) and release region. */
export function WatchlistSettings() {
  const qc = useQueryClient();
  const config = useConfig();
  const c = config.data;
  const save = async (body: Record<string, unknown>) => {
    await api("/watchlist/config", { method: "PUT", json: body });
    await qc.invalidateQueries({ queryKey: ["watchlist"] });
  };
  return (
    <PageFrame crumbs={["Settings", "Watchlist"]} title="Watchlist" subtitle="Watchlist uses The Movie Database (TMDB). One key serves everyone on this Cortex.">
      <Grid>
        <Panel span={7} label="TMDB key" meta={c ? (c.configured ? "Connected" : "Not set") : undefined}>
          {!c ? null : c.fromEnv ? (
            <p className="settings-muted">The key is set by the server's TMDB_API_KEY environment variable.</p>
          ) : c.canConfigure ? (
            <div className="settings-stack">
              {c.configured && (
                <p className="settings-muted">
                  <Badge tone="positive">Key saved</Badge> Paste a new key to replace it.
                </p>
              )}
              <TmdbKeyForm />
              {c.configured && (
                <div>
                  <Button size="sm" variant="ghost" onClick={() => save({ apiKey: "" })}>
                    Remove key
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="settings-muted">{c.configured ? "TMDB is connected." : "Ask an admin to add a TMDB key here."}</p>
          )}
        </Panel>
        <Panel span={5} label="Release region">
          <div className="settings-stack">
            <select className="wl-select" value={c?.region ?? "GB"} disabled={!c?.isAdmin} onChange={(e) => save({ region: e.target.value })}>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <p className="settings-muted">Used for "In cinemas" and "Upcoming" release dates.</p>
          </div>
        </Panel>
      </Grid>
    </PageFrame>
  );
}
