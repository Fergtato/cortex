import { strConf, useRouter, type WidgetProps } from "@cortex/core";
import { Stat } from "@cortex/ui";
import "./watchlist.css";
import { entryToMedia, Poster, titlePath } from "./components";
import { useConfig, useLibrary, useStats, useUpcoming } from "./data";

/* Watchlist widgets for Home dashboards. */

function NotSetUp() {
  return <div className="dw-unconfigured">Set up Watchlist with a TMDB key first.</div>;
}

function PosterStrip({ status, empty }: { status: "watching" | "watchlist"; empty: string }) {
  const { navigate } = useRouter();
  const config = useConfig();
  const lib = useLibrary();
  if (config.data && !config.data.configured) return <NotSetUp />;
  const items = (lib.data?.entries ?? []).filter((e) => e.status === status).map(entryToMedia);
  if (lib.data && !items.length) return <div className="dw-unconfigured">{empty}</div>;
  return (
    <div className="wl-w">
      <span className="cx-label">{status === "watching" ? "Continue watching" : "Watchlist"}</span>
      <div className="wl-w__posters">
        {items.slice(0, 12).map((m) => (
          <button key={`${m.mediaType}:${m.id}`} type="button" className="wl-w__poster" title={m.title} onClick={() => navigate(titlePath(m))}>
            <Poster path={m.posterPath} title={m.title} size="w185" />
          </button>
        ))}
      </div>
    </div>
  );
}

export const ContinueWidget = () => <PosterStrip status="watching" empty="Nothing in progress." />;
export const QueueWidget = () => <PosterStrip status="watchlist" empty="Your watchlist is empty." />;

export function UpcomingWidget({ widget }: WidgetProps) {
  const { navigate } = useRouter();
  const config = useConfig();
  const up = useUpcoming(!!config.data?.configured);
  const limit = Number(widget.config.limit) || 6;
  if (config.data && !config.data.configured) return <NotSetUp />;
  if (up.data && !up.data.length) return <div className="dw-unconfigured">No upcoming episodes for the shows you follow.</div>;
  return (
    <div className="wl-w">
      <span className="cx-label">Upcoming episodes</span>
      <ul className="wl-w__list">
        {up.data?.slice(0, limit).map((u) => (
          <li key={u.tmdbId}>
            <button type="button" className="wl-w__item" onClick={() => navigate(`/watchlist/tv/${u.tmdbId}`)}>
              <span className="wl-w__title">{u.title}</span>
              <span className="wl-muted wl-small">
                S{u.next.seasonNumber} E{u.next.episodeNumber}
              </span>
              <span className="wl-w__date">{new Date(`${u.next.airDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function StatsWidget({ widget }: WidgetProps) {
  const stats = useStats();
  const period = (strConf(widget.config, "period") || "week") as "week" | "sixMonths" | "year" | "lifetime";
  if (!stats.data) return null;
  const tv = stats.data.tv[period];
  const mv = stats.data.movie[period];
  const label = { week: "This week", sixMonths: "6 months", year: "This year", lifetime: "All time" }[period];
  return (
    <div className="wl-w wl-w--center">
      <Stat label={`Watched · ${label}`} value={`${Math.round((tv.minutes + mv.minutes) / 6) / 10}`} unit="hours" footer={<span>{tv.count} episodes · {mv.count} movies</span>} />
    </div>
  );
}

export function StatsConfig({ widget, dash }: WidgetProps) {
  return (
    <div className="dw-config-form">
      <label className="dw-config-label">Period</label>
      <select className="dw-config-select" value={strConf(widget.config, "period") || "week"} onChange={(e) => dash.patchWidget(widget.id, { period: e.target.value })}>
        <option value="week">This week</option>
        <option value="sixMonths">6 months</option>
        <option value="year">This year</option>
        <option value="lifetime">All time</option>
      </select>
    </div>
  );
}
