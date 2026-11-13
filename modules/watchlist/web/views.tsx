import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, PageFrame, useRouter, type ModuleViewProps } from "@cortex/core";
import { Button, Grid, Icon, Input, Panel, Sidebar } from "@cortex/ui";
import { useQueryClient } from "@tanstack/react-query";
import "./watchlist.css";
import { STATUS_LABELS, type MediaSummary } from "../shared/types";
import { BASE, entryToMedia, MediaRow, QuickAddMenu, titlePath, useImg, year } from "./components";
import { useConfig, useDebounced, useEntryMap, useFirstPage, useLibrary, useQuickSearch, useRecommended, useUpcoming } from "./data";
import { AnimePage, BrowsePage, SearchPage } from "./browse";
import { DetailPage } from "./detail";
import { DiscoverPage } from "./discover";
import { ImportPage } from "./import";
import { LibraryPage, ListPage, StatsPage } from "./library";

const NAV = [
  { id: "/", label: "Home", icon: "home" as const },
  { id: "/search", label: "Search", icon: "search" as const },
  { id: "/movies", label: "Movies", icon: "film" as const },
  { id: "/tv", label: "TV shows", icon: "grid" as const },
  { id: "/anime", label: "Anime", icon: "bolt" as const },
  { id: "/discover", label: "Discover", icon: "pulse" as const },
  { id: "/library", label: "Library", icon: "list" as const },
  { id: "/stats", label: "Stats", icon: "clock" as const },
];

export function WatchlistSidebar({ subpath }: ModuleViewProps) {
  const { navigate, search } = useRouter();
  const lib = useLibrary();
  const entries = lib.data?.entries ?? [];
  const count = (s: string) => entries.filter((e) => e.status === s).length;
  const status = new URLSearchParams(search).get("status");
  const active = subpath.startsWith("/lists/")
    ? subpath
    : subpath === "/library" && status
      ? `/library?status=${status}`
      : (NAV.find((n) => n.id !== "/" && subpath === n.id)?.id ?? (/^\/(movie|tv)\/\d+/.test(subpath) ? "" : "/"));
  return (
    <Sidebar
      title="Watchlist"
      sections={[
        { items: NAV },
        {
          label: "Library",
          items: [
            { id: "/library?status=watching", label: "Watching", count: count("watching") },
            { id: "/library?status=watchlist", label: "Watchlist", count: count("watchlist") },
            { id: "/library?status=completed", label: "Watched", count: count("completed") },
          ],
        },
        ...(lib.data?.lists.length ? [{ label: "Lists", items: lib.data.lists.map((l) => ({ id: `/lists/${l.id}`, label: l.name, count: l.items.length })) }] : []),
      ]}
      active={active}
      onSelect={(id) => navigate(id === "/" ? BASE : BASE + id)}
    />
  );
}

/** Topbar search box shared by every Watchlist page: live results while typing, Enter for the full search. */
export function SearchBox() {
  const { navigate } = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);
  const dq = useDebounced(q.trim(), 250);
  const results = useQuickSearch(dq);
  const items = q.trim().length >= 2 ? (results.data?.results ?? []).slice(0, 6) : [];
  const img = useImg();
  const entries = useEntryMap();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => setActive(-1), [dq]);

  const go = (to: string) => {
    setOpen(false);
    setQ("");
    navigate(to);
  };
  const showAll = () => go(`${BASE}/search?q=${encodeURIComponent(q.trim())}`);

  return (
    <form
      ref={box}
      className="wl-searchbox"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (active >= 0 && items[active]) go(titlePath(items[active]));
        else if (q.trim()) showAll();
      }}
    >
      <Input
        icon="search"
        placeholder="Search movies & TV"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(items.length - 1, i + 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(-1, i - 1));
          }
        }}
        aria-label="Search movies and TV"
        role="combobox"
        aria-expanded={open && q.trim().length >= 2}
        aria-controls="wl-search-results"
        aria-activedescendant={active >= 0 ? `wl-sr-${active}` : undefined}
        autoComplete="off"
      />
      {open && q.trim().length >= 2 && (
        <div className="wl-sr" id="wl-search-results" role="listbox" aria-label="Search results">
          {items.map((m, i) => {
            const src = img(m.posterPath, "w92");
            const entry = entries.get(`${m.mediaType}:${m.id}`);
            return (
              <button
                key={`${m.mediaType}:${m.id}`}
                id={`wl-sr-${i}`}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`wl-sr__item${i === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(titlePath(m))}
              >
                <span className="wl-sr__thumb">{src ? <img src={src} alt="" /> : <Icon name="film" size={14} />}</span>
                <span className="wl-sr__text">
                  <span className="wl-sr__title">{m.title}</span>
                  <span className="wl-sr__meta">
                    {m.mediaType === "movie" ? "Movie" : "TV"}
                    {year(m.releaseDate) && ` · ${year(m.releaseDate)}`}
                    {entry && ` · ${STATUS_LABELS[entry.status]}`}
                  </span>
                </span>
              </button>
            );
          })}
          {!items.length && <p className="wl-sr__empty">{results.isFetching || dq !== q.trim() ? "Searching…" : `No matches for “${q.trim()}”.`}</p>}
          <button type="button" className="wl-sr__all" onClick={showAll}>
            <Icon name="search" size={14} />
            <span>All results for “{q.trim()}”</span>
          </button>
        </div>
      )}
    </form>
  );
}

export function Frame({ crumbs, children, title, subtitle, actions }: { crumbs: ReactNode[]; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <PageFrame
      crumbs={crumbs}
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {actions}
          <SearchBox />
        </>
      }
    >
      <div className="wl-root">{children}</div>
    </PageFrame>
  );
}

export function WatchlistPage({ subpath }: ModuleViewProps) {
  const config = useConfig();
  if (config.isError) return <PageFrame crumbs={["Watchlist"]} title="Couldn't load Watchlist" subtitle={String(config.error)} />;
  if (!config.data) return <PageFrame crumbs={["Watchlist"]} />;
  if (!config.data.configured) return <Setup canConfigure={config.data.canConfigure} />;
  const detail = /^\/(movie|tv)\/(\d+)/.exec(subpath);
  if (detail) return <DetailPage key={subpath} type={detail[1] as "movie" | "tv"} id={Number(detail[2])} />;
  if (subpath.startsWith("/movies")) return <BrowsePage type="movie" />;
  if (subpath.startsWith("/tv")) return <BrowsePage type="tv" />;
  if (subpath.startsWith("/anime")) return <AnimePage />;
  if (subpath.startsWith("/search")) return <SearchPage />;
  if (subpath.startsWith("/lists/")) return <ListPage id={subpath.split("/")[2]} />;
  if (subpath.startsWith("/library")) return <LibraryPage />;
  if (subpath.startsWith("/stats")) return <StatsPage />;
  if (subpath.startsWith("/discover")) return <DiscoverPage />;
  if (subpath.startsWith("/import")) return <ImportPage />;
  return <Home />;
}

/* ------------------------------------------------------------------ setup */

export function TmdbKeyForm({ onSaved }: { onSaved?: () => void }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="wl-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/watchlist/config", { method: "PUT", json: { apiKey: key.trim() } });
          await qc.invalidateQueries({ queryKey: ["watchlist"] });
          setKey("");
          onSaved?.();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input label="TMDB API key or read access token" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} invalid={!!error} hint={error ?? "Stored encrypted on this server. It's never sent to browsers."} />
      <div>
        <Button type="submit" variant="primary" disabled={!key.trim() || busy}>
          {busy ? "Checking…" : "Save key"}
        </Button>
      </div>
    </form>
  );
}

function Setup({ canConfigure }: { canConfigure: boolean }) {
  return (
    <PageFrame crumbs={["Watchlist", "Set up"]} title="Set up Watchlist" subtitle="Watchlist uses The Movie Database (TMDB) for titles, posters and episode data.">
      <Grid>
        <Panel span={7} label="TMDB key" bracket>
          {canConfigure ? (
            <div className="wl-setup">
              <ol className="wl-steps">
                <li>
                  Create a free account at <a href="https://www.themoviedb.org/signup" target="_blank" rel="noreferrer">themoviedb.org</a>.
                </li>
                <li>
                  Open <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer">Settings → API</a> and copy the <strong>API Read Access Token</strong> (or the API key).
                </li>
                <li>Paste it below. One key serves everyone on this Cortex.</li>
              </ol>
              <TmdbKeyForm />
            </div>
          ) : (
            <p className="wl-help">Ask the person who runs this Cortex to add a TMDB key in Settings, Watchlist.</p>
          )}
        </Panel>
        <Panel span={5} label="About TMDB">
          <p className="wl-help">This product uses the TMDB API but is not endorsed or certified by TMDB. Posters load from TMDB's image servers.</p>
        </Panel>
      </Grid>
    </PageFrame>
  );
}

/* ------------------------------------------------------------------- home */

function Hero({ media }: { media: MediaSummary }) {
  const { navigate } = useRouter();
  const img = useImg();
  const entry = useEntryMap().get(`${media.mediaType}:${media.id}`);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const backdrop = img(media.backdropPath, "w1280");
  return (
    <section className="wl-hero">
      {backdrop && <img className="wl-hero__img" src={backdrop} alt="" />}
      <div className="wl-hero__shade" />
      <div className="wl-hero__body">
        <span className="cx-label">Trending this week</span>
        <h1 className="wl-hero__title">{media.title}</h1>
        <span className="wl-muted">
          {media.mediaType === "movie" ? "Movie" : "TV"} · {year(media.releaseDate)}
          {media.rating > 0 && ` · ★ ${media.rating.toFixed(1)}`}
        </span>
        <p className="wl-hero__overview">{media.overview}</p>
        <div className="wl-hero__actions">
          <Button variant="primary" onClick={() => navigate(titlePath(media))}>
            Details
          </Button>
          <Button variant="secondary" icon={entry ? "check" : "plus"} onClick={(e) => setAnchor(e.currentTarget)}>
            {entry ? "In your library" : "Add to list"}
          </Button>
        </div>
      </div>
      {anchor && <QuickAddMenu media={media} entry={entry} anchor={anchor} onClose={() => setAnchor(null)} />}
    </section>
  );
}

function Home() {
  const lib = useLibrary();
  const hasLibrary = (lib.data?.entries.length ?? 0) > 0;
  const trending = useFirstPage(["trending"], "/watchlist/tmdb/trending");
  const popularMovies = useFirstPage(["list", "movie", "popular"], "/watchlist/tmdb/list/movie/popular?page=1");
  const popularTv = useFirstPage(["list", "tv", "popular"], "/watchlist/tmdb/list/tv/popular?page=1");
  const topRated = useFirstPage(["list", "movie", "top_rated"], "/watchlist/tmdb/list/movie/top_rated?page=1");
  const upcomingMovies = useFirstPage(["list", "movie", "upcoming"], "/watchlist/tmdb/list/movie/upcoming?page=1");
  const recommended = useRecommended(hasLibrary);
  const upcoming = useUpcoming(hasLibrary);
  const watching = lib.data?.entries.filter((e) => e.status === "watching").map(entryToMedia);
  const hero = trending.data?.results.find((m) => m.backdropPath) ?? trending.data?.results[0];
  return (
    <Frame crumbs={["Watchlist"]}>
      {hero && <Hero media={hero} />}
      {watching && watching.length > 0 && <MediaRow title="Continue watching" items={watching} to={`${BASE}/library?status=watching`} />}
      {upcoming.data && upcoming.data.length > 0 && (
        <section className="wl-row">
          <header className="wl-row__head">
            <h2 className="cx-label">New episodes soon</h2>
          </header>
          <div className="wl-upcoming">
            {upcoming.data.slice(0, 8).map((u) => (
              <UpcomingCard key={u.tmdbId} item={u} />
            ))}
          </div>
        </section>
      )}
      {hasLibrary && <MediaRow title="Recommended for you" items={recommended.data} loading={recommended.isPending} />}
      <MediaRow title="Trending" items={trending.data?.results} loading={trending.isPending} to={`${BASE}/movies?category=trending`} />
      <MediaRow title="Popular movies" items={popularMovies.data?.results} loading={popularMovies.isPending} to={`${BASE}/movies`} />
      <MediaRow title="Popular TV" items={popularTv.data?.results} loading={popularTv.isPending} to={`${BASE}/tv`} />
      <MediaRow title="Top rated" items={topRated.data?.results} loading={topRated.isPending} to={`${BASE}/movies?category=top_rated`} />
      <MediaRow title="Coming soon" items={upcomingMovies.data?.results} loading={upcomingMovies.isPending} to={`${BASE}/movies?category=upcoming`} />
    </Frame>
  );
}

export function UpcomingCard({ item }: { item: { tmdbId: number; title: string; backdropPath: string | null; posterPath: string | null; next: { seasonNumber: number; episodeNumber: number; name: string; airDate: string } } }) {
  const { navigate } = useRouter();
  const img = useImg();
  const days = Math.round((Date.parse(`${item.next.airDate}T00:00:00`) - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  const when = days <= 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7 ? new Date(`${item.next.airDate}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }) : new Date(`${item.next.airDate}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const src = img(item.backdropPath, "w780") ?? img(item.posterPath, "w342");
  return (
    <button type="button" className="wl-upcard" onClick={() => navigate(`${BASE}/tv/${item.tmdbId}`)}>
      <span className="wl-upcard__img">{src && <img src={src} alt="" loading="lazy" />}</span>
      <span className="wl-upcard__when">{when}</span>
      <span className="wl-upcard__title">{item.title}</span>
      <span className="wl-muted wl-small">
        S{item.next.seasonNumber} · E{item.next.episodeNumber}
        {item.next.name && !/^Episode \d+$/.test(item.next.name) ? ` · ${item.next.name}` : ""}
      </span>
    </button>
  );
}
