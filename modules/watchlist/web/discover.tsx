import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, useRouter } from "@cortex/core";
import { Button, Kbd, Segmented } from "@cortex/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { STATUS_LABELS, type MediaSummary, type TrackStatus } from "../shared/types";
import { Poster, QuickAddMenu, titlePath, useImg, year } from "./components";
import { discoverPath, libApi, markWatched, useEntryMap, useGenreNames, useInfinite, useLibMutation } from "./data";
import { Frame } from "./views";
import { useQueryParam } from "./browse";

/*
 * Discover: one title at a time. Skip it (remembered on the server so it
 * doesn't come round again) or file it with one press. Drag the card left
 * or right, use the buttons, or the arrow keys.
 */

type Kind = "movie" | "tv" | "anime";
type Source = "popular" | "rating";
type Action = { media: MediaSummary; kind: "skip" | TrackStatus };

const DRAG_COMMIT = 110;

function useDismissed() {
  return useQuery({ queryKey: ["watchlist", "lib", "dismissed"], queryFn: () => api<string[]>("/watchlist/dismissed") });
}

export function DiscoverPage() {
  const { navigate } = useRouter();
  const qc = useQueryClient();
  const img = useImg();
  const genres = useGenreNames();
  const [kindRaw, setKind] = useQueryParam("type", "movie");
  const [sourceRaw, setSource] = useQueryParam("source", "popular");
  const kind = kindRaw as Kind;
  const source = sourceRaw as Source;
  const entries = useEntryMap();
  const dismissed = useDismissed();
  const type = kind === "anime" ? "tv" : kind;
  const feed = useInfinite(["discover-deck", kind, source], discoverPath(type, { sort: source, anime: kind === "anime" }), !!dismissed.data);

  // Titles acted on this session leave the deck at once, before the library refetches.
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<Action[]>([]);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [leaving, setLeaving] = useState<"left" | "right" | "up" | null>(null);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const skipSet = useMemo(() => new Set(dismissed.data ?? []), [dismissed.data]);
  const deck = useMemo(() => {
    const seen = new Set<string>();
    const out: MediaSummary[] = [];
    for (const m of feed.data?.pages.flatMap((p) => p.results) ?? []) {
      const k = `${m.mediaType}:${m.id}`;
      if (seen.has(k) || skipSet.has(k) || entries.has(k) || gone.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    return out;
  }, [feed.data, skipSet, entries, gone]);

  // Keep a few cards queued.
  useEffect(() => {
    if (deck.length < 5 && feed.hasNextPage && !feed.isFetchingNextPage) void feed.fetchNextPage();
  }, [deck.length, feed]);

  const current = deck[0];
  const next = deck[1];

  // Warm the cache for the next posters so a promoted card never shows a blank or stale image.
  useEffect(() => {
    for (const m of deck.slice(1, 4)) {
      const src = img(m.posterPath, "w500");
      if (src) new Image().src = src;
    }
  }, [deck, img]);

  const setStatus = useLibMutation((a: { m: MediaSummary; s: TrackStatus }) => (a.s === "completed" ? markWatched(a.m) : libApi.setStatus(a.m.mediaType, a.m.id, a.s)));

  const act = async (kindOf: Action["kind"]) => {
    if (!current || leaving) return;
    const m = current;
    setLeaving(kindOf === "skip" ? "left" : kindOf === "completed" ? "up" : "right");
    setTimeout(() => {
      setGone((g) => new Set(g).add(`${m.mediaType}:${m.id}`));
      setHistory((h) => [{ media: m, kind: kindOf }, ...h].slice(0, 20));
      setLeaving(null);
      setDrag(null);
    }, 180);
    if (kindOf === "skip") {
      await api("/watchlist/dismissed", { method: "POST", json: { mediaType: m.mediaType, tmdbId: m.id } });
      void qc.invalidateQueries({ queryKey: ["watchlist", "lib", "dismissed"] });
    } else {
      setStatus.mutate({ m, s: kindOf });
    }
  };

  const undo = async () => {
    const last = history[0];
    if (!last) return;
    const k = `${last.media.mediaType}:${last.media.id}`;
    if (last.kind === "skip") await api(`/watchlist/dismissed/${last.media.mediaType}/${last.media.id}`, { method: "DELETE" });
    else await libApi.remove(last.media.mediaType, last.media.id);
    await qc.invalidateQueries({ queryKey: ["watchlist", "lib"] });
    setHistory((h) => h.slice(1));
    setGone((g) => {
      const n = new Set(g);
      n.delete(k);
      return n;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (menu || (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowLeft") act("skip");
      else if (e.key === "ArrowRight") act("watchlist");
      else if (e.key === "ArrowUp") act("completed");
      else if (e.key === "ArrowDown") act("watching");
      else if (e.key === "z" || e.key === "Z") void undo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDown = (e: ReactPointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    start.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent) => start.current && setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y });
  const onUp = () => {
    const d = drag;
    start.current = null;
    if (!d) return;
    if (d.x < -DRAG_COMMIT) act("skip");
    else if (d.x > DRAG_COMMIT) act("watchlist");
    else if (d.y < -DRAG_COMMIT) act("completed");
    else if (Math.abs(d.x) < 6 && Math.abs(d.y) < 6 && current) navigate(titlePath(current));
    else setDrag(null);
  };

  const hint = drag ? (drag.x < -40 ? "skip" : drag.x > 40 ? "watchlist" : drag.y < -40 ? "completed" : null) : null;
  const transform = leaving
    ? leaving === "left"
      ? "translate(-140%, 0) rotate(-14deg)"
      : leaving === "right"
        ? "translate(140%, 0) rotate(14deg)"
        : "translate(0, -140%)"
    : drag
      ? `translate(${drag.x}px, ${Math.min(0, drag.y)}px) rotate(${drag.x / 18}deg)`
      : undefined;

  const loading = !dismissed.data || feed.isPending;
  const backdrop = current ? img(current.backdropPath, "w780") : null;

  return (
    <Frame
      crumbs={["Watchlist", "Discover"]}
      actions={
        <Button size="sm" variant="ghost" icon="arrow-up" onClick={undo} disabled={!history.length}>
          Undo
        </Button>
      }
    >
      <div className="wl-toolbar wl-discover__bar">
        <Segmented
          size="sm"
          aria-label="Type"
          options={[
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV" },
            { value: "anime", label: "Anime" },
          ]}
          value={kind}
          onChange={(v) => setKind(v as Kind)}
        />
        <Segmented
          size="sm"
          aria-label="Source"
          options={[
            { value: "popular", label: "Popular" },
            { value: "rating", label: "Top rated" },
          ]}
          value={source}
          onChange={(v) => setSource(v as Source)}
        />
      </div>

      <div className="wl-discover">
        <div className="wl-deck">
          {next && (
            <div key={`${next.mediaType}:${next.id}`} className={`wl-swipe wl-swipe--next${drag || leaving ? " is-visible" : ""}`} aria-hidden>
              <Poster path={next.posterPath} title={next.title} size="w500" />
            </div>
          )}
          {current ? (
            <article
              key={`${current.mediaType}:${current.id}`}
              className={`wl-swipe wl-swipe--current${drag ? " is-dragging" : ""}${hint ? ` hint-${hint}` : ""}`}
              style={{ transform }}
              onPointerDown={onDown}
              onDragStart={(e) => e.preventDefault()}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => {
                start.current = null;
                setDrag(null);
              }}
              aria-label={current.title}
            >
              <Poster path={current.posterPath} title={current.title} size="w500" />
              <span className="wl-swipe__stamp" aria-hidden>
                {hint === "skip" ? "Skip" : hint === "watchlist" ? "Watchlist" : hint === "completed" ? "Watched" : ""}
              </span>
            </article>
          ) : (
            <div className="wl-swipe wl-swipe--empty">
              <p className="wl-muted">{loading ? "Loading…" : "You've seen everything here. Try another type or source."}</p>
            </div>
          )}
        </div>

        <div className="wl-discover__info">
          {current && (
            <>
              {backdrop && <img className="wl-discover__backdrop" src={backdrop} alt="" />}
              <span className="cx-label">
                {current.mediaType === "movie" ? "Movie" : "TV"}
                {year(current.releaseDate) && ` · ${year(current.releaseDate)}`}
                {current.rating > 0 && ` · ★ ${current.rating.toFixed(1)}`}
              </span>
              <h2 className="wl-discover__title">{current.title}</h2>
              <p className="wl-muted wl-small">
                {current.genreIds
                  .map((g) => genres.get(g))
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="wl-discover__overview">{current.overview || "No overview."}</p>
            </>
          )}
          <div className="wl-discover__actions">
            <Button variant="secondary" icon="x" onClick={() => act("skip")} disabled={!current}>
              Skip
            </Button>
            <Button variant="primary" icon="bell" onClick={() => act("watchlist")} disabled={!current}>
              {STATUS_LABELS.watchlist}
            </Button>
            <Button variant="secondary" icon="clock" onClick={() => act("watching")} disabled={!current}>
              {STATUS_LABELS.watching}
            </Button>
            <Button variant="secondary" icon="check" onClick={() => act("completed")} disabled={!current}>
              {STATUS_LABELS.completed}
            </Button>
            <Button variant="ghost" icon="more" aria-label="Lists and more" disabled={!current} onClick={(e) => setMenu(e.currentTarget)} />
          </div>
          <p className="wl-discover__keys wl-muted wl-small">
            <Kbd>←</Kbd> skip <Kbd>→</Kbd> watchlist <Kbd>↓</Kbd> watching <Kbd>↑</Kbd> watched <Kbd>Z</Kbd> undo · drag the poster, or tap it for details
          </p>
        </div>
      </div>
      {menu && current && (
        <QuickAddMenu
          media={current}
          entry={entries.get(`${current.mediaType}:${current.id}`)}
          anchor={menu}
          onClose={() => setMenu(null)}
        />
      )}
    </Frame>
  );
}
