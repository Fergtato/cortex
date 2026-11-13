import React, { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog, useRouter } from "@cortex/core";
import { Badge, Button, Icon } from "@cortex/ui";
import { STATUS_LABELS, type LibraryEntry, type MediaSummary, type MediaType, type TrackStatus } from "../shared/types";
import { libApi, markWatched, useConfig, useEntryMap, useLibMutation, useLibrary, usePerson } from "./data";

export const BASE = "/watchlist";
export const titlePath = (m: { mediaType: MediaType; id: number }) => `${BASE}/${m.mediaType}/${m.id}`;
export const year = (d: string) => (d ? d.slice(0, 4) : "");

/* ----------------------------------------------------------------- images */

export function useImg() {
  const base = useConfig().data?.imageBase;
  return (path: string | null | undefined, size: "w92" | "w185" | "w342" | "w500" | "w780" | "w1280" | "original" = "w342") => (base && path ? `${base}/${size}${path}` : null);
}

export function Poster({ path, title, size = "w342", className }: { path: string | null; title: string; size?: "w185" | "w342" | "w500"; className?: string }) {
  const img = useImg();
  const src = img(path, size);
  const [failed, setFailed] = useState(false);
  return (
    <span className={`wl-poster ${className ?? ""}`}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="wl-poster__fallback" aria-hidden>
          <Icon name="film" size={24} />
          <span>{title}</span>
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- Popover */

/** A menu anchored to a button, rendered in a fixed layer so cards and rows never clip it. */
export function Popover({ anchor, onClose, children, align = "end" }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; align?: "start" | "end" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect();
    const el = ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 300;
    let left = align === "end" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    let top = r.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 4);
    setPos({ top, left });
  }, [anchor, align]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onScroll = (e: Event) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className="wl-pop" role="menu" style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}>
      {children}
    </div>,
    document.body,
  );
}

/* --------------------------------------------------------- Quick add menu */

/** Watchlist / Watching / Watched and custom lists for one title, without opening it. */
export function QuickAddMenu({ media, entry, anchor, onClose }: { media: MediaSummary; entry?: LibraryEntry; anchor: HTMLElement; onClose: () => void }) {
  const { navigate } = useRouter();
  const dialog = useDialog();
  const lists = useLibrary().data?.lists ?? [];
  const setStatus = useLibMutation((s: TrackStatus) => (s === "completed" ? markWatched(media) : libApi.setStatus(media.mediaType, media.id, s)));
  const remove = useLibMutation(() => libApi.remove(media.mediaType, media.id));
  const toggleList = useLibMutation(async (a: { listId: string; on: boolean }) =>
    a.on
      ? libApi.addToList(a.listId, { mediaType: media.mediaType, tmdbId: media.id, title: media.title, posterPath: media.posterPath, releaseDate: media.releaseDate })
      : libApi.removeFromList(a.listId, media.mediaType, media.id),
  );
  const newList = useLibMutation(async (name: string) => {
    const { id } = await libApi.createList(name);
    await libApi.addToList(id, { mediaType: media.mediaType, tmdbId: media.id, title: media.title, posterPath: media.posterPath, releaseDate: media.releaseDate });
  });
  const busy = setStatus.isPending || remove.isPending;

  const item = (s: TrackStatus, icon: "bell" | "clock" | "check") => (
    <button type="button" role="menuitemradio" aria-checked={entry?.status === s} className={`wl-pop__item${entry?.status === s ? " is-on" : ""}`} disabled={busy} onClick={() => setStatus.mutate(s, { onSuccess: onClose })}>
      <Icon name={icon} size={14} />
      <span>{STATUS_LABELS[s]}</span>
      {entry?.status === s && <Icon name="check" size={14} className="wl-pop__check" />}
    </button>
  );

  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div className="wl-pop__title">
        <strong>{media.title}</strong>
        <span>
          {media.mediaType === "movie" ? "Movie" : "TV"}
          {year(media.releaseDate) && ` · ${year(media.releaseDate)}`}
        </span>
      </div>
      {item("watchlist", "bell")}
      {item("watching", "clock")}
      {item("completed", "check")}
      <div className="wl-pop__sep" />
      <div className="cx-label wl-pop__label">Lists</div>
      {lists.map((l) => {
        const on = l.items.some((i) => i.mediaType === media.mediaType && i.tmdbId === media.id);
        return (
          <button key={l.id} type="button" role="menuitemcheckbox" aria-checked={on} className="wl-pop__item" onClick={() => toggleList.mutate({ listId: l.id, on: !on })}>
            <span className={`wl-check${on ? " is-on" : ""}`} aria-hidden>
              {on && <Icon name="check" size={10} strokeWidth={2.5} />}
            </span>
            <span>{l.name}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="wl-pop__item wl-pop__item--muted"
        onClick={async () => {
          const name = await dialog.prompt("New list");
          if (name?.trim()) newList.mutate(name.trim());
        }}
      >
        <Icon name="plus" size={14} />
        <span>New list…</span>
      </button>
      <div className="wl-pop__sep" />
      <button type="button" className="wl-pop__item wl-pop__item--muted" onClick={() => navigate(titlePath(media))}>
        <Icon name="arrow-up-right" size={14} />
        <span>Details</span>
      </button>
      {entry && (
        <button
          type="button"
          className="wl-pop__item wl-pop__item--danger"
          onClick={async () => {
            const msg = entry.watchedCount ? `Remove "${media.title}" and its watch history from your library?` : `Remove "${media.title}" from your library?`;
            if (await dialog.confirm(msg, { confirmLabel: "Remove", danger: true })) remove.mutate(undefined, { onSuccess: onClose });
          }}
        >
          <Icon name="x" size={14} />
          <span>Remove from library</span>
        </button>
      )}
    </Popover>
  );
}

/* -------------------------------------------------------------- MediaCard */

const QUICK: { status: TrackStatus; icon: "bell" | "clock" | "check" }[] = [
  { status: "watchlist", icon: "bell" },
  { status: "watching", icon: "clock" },
  { status: "completed", icon: "check" },
];

/**
 * Poster card. Hovering shows one button per status (one click to file it)
 * plus a menu for custom lists; the current status is lit and clicking it
 * again takes the title out of the library.
 */
export function MediaCard({ media, subtitle }: { media: MediaSummary; subtitle?: ReactNode }) {
  const { navigate } = useRouter();
  const dialog = useDialog();
  const entry = useEntryMap().get(`${media.mediaType}:${media.id}`);
  const more = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const setStatus = useLibMutation((s: TrackStatus) => (s === "completed" ? markWatched(media) : libApi.setStatus(media.mediaType, media.id, s)));
  const remove = useLibMutation(() => libApi.remove(media.mediaType, media.id));
  const busy = setStatus.isPending || remove.isPending;
  const progress = entry && media.mediaType === "tv" && entry.airedEpisodes ? Math.min(1, entry.watchedCount / entry.airedEpisodes) : null;

  const quick = async (s: TrackStatus) => {
    if (entry?.status !== s) return setStatus.mutate(s);
    const msg = entry.watchedCount ? `Remove "${media.title}" and its watch history from your library?` : null;
    if (!msg || (await dialog.confirm(msg, { confirmLabel: "Remove", danger: true }))) remove.mutate(undefined);
  };

  return (
    <div className={`wl-card${entry ? ` is-${entry.status}` : ""}${open ? " is-open" : ""}`}>
      <button type="button" className="wl-card__hit" onClick={() => navigate(titlePath(media))} aria-label={`${media.title}${year(media.releaseDate) ? ` (${year(media.releaseDate)})` : ""}`}>
        <Poster path={media.posterPath} title={media.title} />
        {entry && (
          <span className="wl-card__status">
            <Badge tone={entry.status === "completed" ? "positive" : entry.status === "watching" ? "accent" : "neutral"}>{STATUS_LABELS[entry.status]}</Badge>
          </span>
        )}
        {progress !== null && progress > 0 && (
          <span className="wl-card__progress" aria-label={`${entry!.watchedCount} of ${entry!.airedEpisodes} episodes`}>
            <span style={{ width: `${progress * 100}%` }} />
          </span>
        )}
      </button>
      <div className="wl-card__actions" role="group" aria-label={`Add ${media.title}`}>
        {QUICK.map((q) => {
          const on = entry?.status === q.status;
          return (
            <button
              key={q.status}
              type="button"
              className={`wl-card__btn${on ? " is-on" : ""}`}
              aria-pressed={on}
              disabled={busy}
              title={on ? `${STATUS_LABELS[q.status]} · click to remove` : STATUS_LABELS[q.status]}
              aria-label={STATUS_LABELS[q.status]}
              onClick={() => quick(q.status)}
            >
              <Icon name={q.icon} size={14} strokeWidth={2} />
            </button>
          );
        })}
        <button ref={more} type="button" className="wl-card__btn" title="Lists and more" aria-label={`More for ${media.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="more" size={14} strokeWidth={2.5} />
        </button>
      </div>
      <div className="wl-card__meta">
        <span className="wl-card__title">{media.title}</span>
        <span className="wl-card__sub">
          {subtitle ?? (
            <>
              {year(media.releaseDate) || "TBA"}
              {media.rating > 0 && <span className="wl-rating">★ {media.rating.toFixed(1)}</span>}
            </>
          )}
        </span>
      </div>
      {open && more.current && <QuickAddMenu media={media} entry={entry} anchor={more.current} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** A library entry as a card-able summary. */
export const entryToMedia = (e: { mediaType: MediaType; tmdbId: number; title: string; posterPath: string | null; releaseDate: string; genreIds?: number[]; originalLanguage?: string }): MediaSummary => ({
  id: e.tmdbId,
  mediaType: e.mediaType,
  title: e.title,
  posterPath: e.posterPath,
  backdropPath: null,
  overview: "",
  releaseDate: e.releaseDate,
  rating: 0,
  voteCount: 0,
  genreIds: e.genreIds ?? [],
  originalLanguage: e.originalLanguage ?? "",
});

/* ---------------------------------------------------------- rows + grids */

/** Columns a `.wl-grid` of this width holds (mirrors its minmax() in CSS). */
function useGridColumns(ref: React.RefObject<HTMLElement>, mounted: boolean) {
  const [cols, setCols] = useState(6);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const cs = getComputedStyle(el);
      const track = cs.gridTemplateColumns.split(" ").filter(Boolean).length;
      if (track > 0) setCols(track);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [ref, mounted]);
  return cols;
}

/**
 * A titled section showing one line of posters. "See all" opens the full
 * page when there is one (`to`), otherwise expands the section in place.
 */
export function MediaRow({ title, items, loading, to, empty, lines = 1 }: { title: string; items: MediaSummary[] | undefined; loading?: boolean; to?: string; empty?: string; lines?: number }) {
  const { navigate } = useRouter();
  const grid = useRef<HTMLDivElement>(null);
  const hidden = !loading && !!items && !items.length && !empty;
  const cols = useGridColumns(grid, !hidden);
  const [expanded, setExpanded] = useState(false);
  const limit = expanded ? Infinity : cols * lines;
  const overflow = (items?.length ?? 0) > cols * lines;
  if (hidden) return null;
  return (
    <section className="wl-row">
      <header className="wl-row__head">
        <h2 className="cx-label">{title}</h2>
        {to ? (
          <Button size="sm" variant="ghost" iconRight="arrow-up-right" onClick={() => navigate(to)}>
            See all
          </Button>
        ) : (
          overflow && (
            <Button size="sm" variant="ghost" iconRight={expanded ? "arrow-up" : "chevron-down"} onClick={() => setExpanded((e) => !e)}>
              {expanded ? "Show less" : `See all ${items!.length}`}
            </Button>
          )
        )}
      </header>
      <div ref={grid} className="wl-grid">
        {loading && !items && Array.from({ length: cols * lines }, (_, i) => <div key={i} className="wl-card wl-card--skeleton" />)}
        {items?.slice(0, limit).map((m) => <MediaCard key={`${m.mediaType}:${m.id}`} media={m} />)}
      </div>
      {items && !items.length && empty && <p className="wl-empty">{empty}</p>}
    </section>
  );
}

/** A responsive poster grid that loads the next page when its end scrolls into view. */
export function MediaGrid({ items, hasMore, loadMore, loading, empty }: { items: MediaSummary[]; hasMore?: boolean; loadMore?: () => void; loading?: boolean; empty?: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || !loadMore || !sentinel.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && loadMore(), { rootMargin: "600px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [hasMore, loadMore, items.length]);
  if (!loading && !items.length) return <p className="wl-empty">{empty ?? "Nothing here."}</p>;
  // De-duplicate: TMDB pages occasionally repeat a title across page boundaries.
  const seen = new Set<string>();
  const unique = items.filter((m) => {
    const k = `${m.mediaType}:${m.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return (
    <>
      <div className="wl-grid">
        {unique.map((m) => (
          <MediaCard key={`${m.mediaType}:${m.id}`} media={m} />
        ))}
        {loading && Array.from({ length: 12 }, (_, i) => <div key={`s${i}`} className="wl-card wl-card--skeleton" />)}
      </div>
      {hasMore && <div ref={sentinel} className="wl-sentinel" aria-hidden />}
    </>
  );
}

/* ----------------------------------------------------------- PersonModal */

export function PersonModal({ id, onClose }: { id: number; onClose: () => void }) {
  const person = usePerson(id);
  const entries = useEntryMap();
  const img = useImg();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const p = person.data;
  const seen = p?.credits.filter((c) => entries.has(`${c.mediaType}:${c.id}`)) ?? [];
  const age = p?.birthday ? Math.floor(((p.deathday ? Date.parse(p.deathday) : Date.now()) - Date.parse(p.birthday)) / (365.25 * 86_400_000)) : null;
  return createPortal(
    <div className="cx-dialog-scrim" onMouseDown={onClose}>
      <div className="cx-dialog wl-person" role="dialog" aria-modal="true" aria-label={p?.name ?? "Person"} onMouseDown={(e) => e.stopPropagation()}>
        <div className="wl-person__head">
          <span className="wl-person__photo">{img(p?.profilePath, "w185") ? <img src={img(p?.profilePath, "w185")!} alt="" /> : <Icon name="user" size={28} />}</span>
          <div className="wl-person__who">
            <p className="cx-dialog__message">{p?.name ?? "Loading…"}</p>
            {p && (
              <span className="wl-muted">
                {[p.knownForDepartment, age !== null ? `${p.deathday ? "Died aged" : "Age"} ${age}` : null, p.placeOfBirth].filter(Boolean).join(" · ")}
              </span>
            )}
          </div>
          <Button size="sm" variant="ghost" icon="x" aria-label="Close" onClick={onClose} />
        </div>
        {p?.biography && <p className="wl-person__bio">{p.biography}</p>}
        {seen.length > 0 && <MediaRow title={`You've seen them in · ${seen.length}`} items={seen} />}
        {p && <MediaRow title="Known for" items={p.credits.slice(0, 16)} />}
      </div>
    </div>,
    document.body,
  );
}
