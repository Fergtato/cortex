import { useMemo, useState } from "react";
import { useDialog } from "@cortex/core";
import { Badge, Button, Icon, Meter, Segmented } from "@cortex/ui";
import { STATUS_LABELS, type Episode, type MediaDetails, type MediaType, type SeasonSummary, type TrackStatus } from "../shared/types";
import { MediaRow, PersonModal, Poster, QuickAddMenu, useImg, year } from "./components";
import { libApi, markWatched, useDetails, useEntryMap, useEvents, useLibMutation, useSeason } from "./data";
import { Frame } from "./views";

const fmtRuntime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const fmtDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "TBA");
const today = () => new Date().toISOString().slice(0, 10);

export function DetailPage({ type, id }: { type: MediaType; id: number }) {
  const q = useDetails(type, id);
  const d = q.data;
  if (q.isError) return <Frame crumbs={["Watchlist", "Not found"]} title="Couldn't load this title" subtitle={String(q.error)}>{null}</Frame>;
  if (!d) return <Frame crumbs={["Watchlist", type === "movie" ? "Movies" : "TV shows"]}>{<div className="wl-detail-skeleton" />}</Frame>;
  return <Detail d={d} />;
}

function Detail({ d }: { d: MediaDetails }) {
  const img = useImg();
  const dialog = useDialog();
  const entry = useEntryMap().get(`${d.mediaType}:${d.id}`);
  const [listAnchor, setListAnchor] = useState<HTMLElement | null>(null);
  const [person, setPerson] = useState<number | null>(null);
  const setStatus = useLibMutation((s: TrackStatus | "none") => {
    if (s === "none") return libApi.remove(d.mediaType, d.id);
    return s === "completed" ? markWatched(d) : libApi.setStatus(d.mediaType, d.id, s);
  });
  const rate = useLibMutation((r: number | null) => libApi.rate(d.mediaType, d.id, r));
  const backdrop = img(d.backdropPath, "w1280");

  return (
    <Frame crumbs={["Watchlist", d.mediaType === "movie" ? "Movies" : "TV shows", d.title]}>
      <section className="wl-detail">
        {backdrop && <img className="wl-detail__backdrop" src={backdrop} alt="" />}
        <div className="wl-detail__shade" />
        <div className="wl-detail__body">
          <Poster path={d.posterPath} title={d.title} size="w500" className="wl-detail__poster" />
          <div className="wl-detail__info">
            <h1 className="wl-detail__title">
              {d.title} {year(d.releaseDate) && <span className="wl-muted">({year(d.releaseDate)})</span>}
            </h1>
            <div className="wl-facts">
              <span>{d.mediaType === "movie" ? "Movie" : "TV"}</span>
              {d.runtime > 0 && <span>{d.mediaType === "tv" ? `${fmtRuntime(d.runtime)} / episode` : fmtRuntime(d.runtime)}</span>}
              {d.mediaType === "tv" && d.numberOfEpisodes !== null && <span>{d.seasons.filter((s) => s.seasonNumber > 0).length} seasons · {d.numberOfEpisodes} episodes</span>}
              {d.status && <span>{d.status}</span>}
              {d.rating > 0 && <span className="wl-rating">★ {d.rating.toFixed(1)} TMDB</span>}
            </div>
            {d.genres.length > 0 && (
              <div className="wl-genres">
                {d.genres.map((g) => (
                  <Badge key={g.id}>{g.name}</Badge>
                ))}
              </div>
            )}
            {d.tagline && <p className="wl-tagline">{d.tagline}</p>}
            <p className="wl-overview">{d.overview || "No overview yet."}</p>

            <div className="wl-actions">
              <Segmented
                aria-label="Status"
                options={[
                  { value: "none", label: "Not tracked" },
                  { value: "watchlist", label: STATUS_LABELS.watchlist },
                  { value: "watching", label: STATUS_LABELS.watching },
                  { value: "completed", label: STATUS_LABELS.completed },
                ]}
                value={entry?.status ?? "none"}
                onChange={async (v) => {
                  if (v === "none" && entry?.watchedCount) {
                    if (!(await dialog.confirm(`Remove "${d.title}" and its watch history?`, { confirmLabel: "Remove", danger: true }))) return;
                  }
                  setStatus.mutate(v as TrackStatus | "none");
                }}
              />
              <Button variant="secondary" icon="list" onClick={(e) => setListAnchor(e.currentTarget)}>
                Lists
              </Button>
              {entry && (
                <label className="wl-rate">
                  <span className="cx-label">Your rating</span>
                  <select className="wl-select" value={entry.rating ?? ""} onChange={(e) => rate.mutate(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">—</option>
                    {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>
                        {r} / 10
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="wl-links">
              {d.trailerKey && (
                <a className="cx-btn cx-btn--ghost cx-btn--sm" href={`https://www.youtube.com/watch?v=${d.trailerKey}`} target="_blank" rel="noreferrer">
                  <Icon name="arrow-up-right" size={14} /> Trailer
                </a>
              )}
              {d.imdbId && (
                <a className="cx-btn cx-btn--ghost cx-btn--sm" href={`https://www.imdb.com/title/${d.imdbId}/`} target="_blank" rel="noreferrer">
                  <Icon name="arrow-up-right" size={14} /> IMDb
                </a>
              )}
              <a className="cx-btn cx-btn--ghost cx-btn--sm" href={`https://www.themoviedb.org/${d.mediaType}/${d.id}`} target="_blank" rel="noreferrer">
                <Icon name="arrow-up-right" size={14} /> TMDB
              </a>
            </div>
          </div>
        </div>
      </section>

      {d.mediaType === "movie" ? <MovieWatches d={d} /> : <TvProgress d={d} />}

      {d.cast.length > 0 && (
        <section className="wl-row">
          <header className="wl-row__head">
            <h2 className="cx-label">Cast</h2>
          </header>
          <div className="wl-cast">
            {d.cast.map((c) => (
              <button key={`${c.id}-${c.character}`} type="button" className="wl-person-chip" onClick={() => setPerson(c.id)}>
                <span className="wl-person-chip__photo">{img(c.profilePath, "w185") ? <img src={img(c.profilePath, "w185")!} alt="" loading="lazy" /> : <Icon name="user" size={20} />}</span>
                <span className="wl-person-chip__name">{c.name}</span>
                <span className="wl-person-chip__role">
                  {c.character}
                  {c.episodeCount ? ` · ${c.episodeCount} eps` : ""}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      <MediaRow title="More like this" items={d.recommendations} />
      {listAnchor && <QuickAddMenu media={d} entry={entry} anchor={listAnchor} onClose={() => setListAnchor(null)} />}
      {person !== null && <PersonModal id={person} onClose={() => setPerson(null)} />}
    </Frame>
  );
}

/* ------------------------------------------------------------- movies */

function MovieWatches({ d }: { d: MediaDetails }) {
  const events = useEvents("movie", d.id);
  const log = useLibMutation(() => libApi.watchMovie(d.id));
  const del = useLibMutation((id: string) => libApi.deleteEvent(id));
  const list = events.data ?? [];
  return (
    <section className="wl-panel">
      <header className="wl-row__head">
        <h2 className="cx-label">Watches</h2>
        <Button size="sm" variant={list.length ? "secondary" : "primary"} icon="check" onClick={() => log.mutate()} disabled={log.isPending}>
          {list.length ? "Log a rewatch" : "Mark as watched"}
        </Button>
      </header>
      {list.length ? (
        <ul className="wl-history">
          {list.map((e, i) => (
            <li key={e.id}>
              <span>{new Date(e.watchedAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
              <span className="wl-muted">{i === list.length - 1 ? "First watch" : "Rewatch"}</span>
              <Button size="sm" variant="ghost" icon="x" aria-label="Delete this watch" onClick={() => del.mutate(e.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="wl-empty">Not watched yet.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ TV */

function TvProgress({ d }: { d: MediaDetails }) {
  const entry = useEntryMap().get(`tv:${d.id}`);
  const events = useEvents("tv", d.id);
  const markAll = useLibMutation(() => libApi.markAll(d.id));
  const watched = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events.data ?? []) if (e.season !== null) m.set(`${e.season}x${e.episode}`, (m.get(`${e.season}x${e.episode}`) ?? 0) + 1);
    return m;
  }, [events.data]);
  const watchedMain = [...watched.keys()].filter((k) => !k.startsWith("0x")).length;
  const aired = entry?.airedEpisodes ?? countAired(d);
  const seasons = [...d.seasons.filter((s) => s.seasonNumber > 0), ...d.seasons.filter((s) => s.seasonNumber === 0)];
  return (
    <section className="wl-panel">
      <header className="wl-row__head">
        <h2 className="cx-label">Episodes</h2>
        <Button size="sm" variant="secondary" icon="check" onClick={() => markAll.mutate()} disabled={markAll.isPending || (aired > 0 && watchedMain >= aired)}>
          {markAll.isPending ? "Marking…" : "Mark all as watched"}
        </Button>
      </header>
      {aired > 0 && (
        <Meter value={watchedMain} max={aired} segments={40} tone={watchedMain >= aired ? "positive" : "accent"} label="Progress" valueLabel={`${watchedMain} / ${aired} aired`} height={10} />
      )}
      {d.nextEpisode && (
        <p className="wl-muted wl-small">
          Next: S{d.nextEpisode.seasonNumber} E{d.nextEpisode.episodeNumber} on {fmtDate(d.nextEpisode.airDate)}
        </p>
      )}
      <div className="wl-seasons">
        {seasons.map((s) => (
          <SeasonBlock key={s.seasonNumber} showId={d.id} season={s} seasons={d.seasons} watched={watched} />
        ))}
      </div>
    </section>
  );
}

function countAired(d: MediaDetails): number {
  const last = d.lastAiredEpisode;
  if (!last) return 0;
  return d.seasons.reduce((n, s) => (s.seasonNumber <= 0 ? n : s.seasonNumber < last.seasonNumber ? n + s.episodeCount : s.seasonNumber === last.seasonNumber ? n + last.episodeNumber : n), 0);
}

function SeasonBlock({ showId, season, seasons, watched }: { showId: number; season: SeasonSummary; seasons: SeasonSummary[]; watched: Map<string, number> }) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const episodes = useSeason(showId, season.seasonNumber, open);
  const watch = useLibMutation((eps: { season: number; episode: number }[]) => libApi.watchEpisodes(showId, eps));
  const unwatch = useLibMutation((eps: { season: number; episode: number }[]) => libApi.unwatchEpisodes(showId, eps));
  const markSeason = useLibMutation(() => libApi.markAll(showId, season.seasonNumber));
  const done = [...watched.keys()].filter((k) => k.startsWith(`${season.seasonNumber}x`)).length;
  const day = today();

  /** Ticking an episode with unwatched earlier ones (this season and earlier seasons) offers to mark those too. */
  const tick = async (e: Episode, all: Episode[]) => {
    const missed: { season: number; episode: number }[] = [];
    if (season.seasonNumber > 0) {
      for (const s of seasons) {
        if (s.seasonNumber <= 0 || s.seasonNumber >= season.seasonNumber) continue;
        for (let n = 1; n <= s.episodeCount; n++) if (!watched.has(`${s.seasonNumber}x${n}`)) missed.push({ season: s.seasonNumber, episode: n });
      }
      for (const x of all) {
        if (x.episodeNumber >= e.episodeNumber || !x.airDate || x.airDate > day) continue;
        if (!watched.has(`${x.seasonNumber}x${x.episodeNumber}`)) missed.push({ season: x.seasonNumber, episode: x.episodeNumber });
      }
    }
    const self = { season: e.seasonNumber, episode: e.episodeNumber };
    if (!missed.length) return watch.mutate([self]);
    const n = missed.length;
    const choice = await dialog.choose(`You haven't marked ${n === 1 ? "the episode" : `${n} episodes`} before this one. Mark ${n === 1 ? "it" : "them"} as watched too?`, [
      { value: "all", label: `Mark ${n + 1} episodes as watched` },
      { value: "one", label: `Just episode ${e.episodeNumber}` },
    ]);
    if (choice === "all") watch.mutate([...missed, self]);
    else if (choice === "one") watch.mutate([self]);
  };

  return (
    <div className={`wl-season${open ? " is-open" : ""}`}>
      <div className="wl-season__head">
        <button type="button" className="wl-season__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} />
          <span className="wl-season__name">{season.name}</span>
          <span className="wl-muted wl-small">
            {done}/{season.episodeCount}
            {season.airDate ? ` · ${year(season.airDate)}` : ""}
          </span>
        </button>
        {season.seasonNumber > 0 && done < season.episodeCount && (
          <Button size="sm" variant="ghost" onClick={() => markSeason.mutate()} disabled={markSeason.isPending}>
            Mark season
          </Button>
        )}
      </div>
      {open && (
        <ul className="wl-episodes">
          {episodes.isPending && <li className="wl-muted">Loading episodes…</li>}
          {episodes.data?.map((e) => {
            const key = `${e.seasonNumber}x${e.episodeNumber}`;
            const times = watched.get(key) ?? 0;
            const aired = !!e.airDate && e.airDate <= day;
            const eps = [{ season: e.seasonNumber, episode: e.episodeNumber }];
            return (
              <li key={e.id} className={times ? "is-watched" : ""}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={times > 0}
                  aria-label={`${times ? "Unmark" : "Mark"} episode ${e.episodeNumber} watched`}
                  className={`wl-check${times ? " is-on" : ""}`}
                  disabled={!aired && !times}
                  onClick={() => (times ? unwatch.mutate(eps) : tick(e, episodes.data ?? []))}
                >
                  {times > 0 && <Icon name="check" size={10} strokeWidth={2.5} />}
                </button>
                <span className="wl-ep__num">{e.episodeNumber}</span>
                <span className="wl-ep__name">
                  {e.name}
                  {times > 1 && <Badge>Watched {times}×</Badge>}
                </span>
                <span className="wl-muted wl-small wl-ep__date">{aired ? fmtDate(e.airDate) : `Airs ${fmtDate(e.airDate)}`}</span>
                {times > 0 && (
                  <Button size="sm" variant="ghost" aria-label="Log a rewatch" title="Log a rewatch" icon="plus" onClick={() => watch.mutate(eps)} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
