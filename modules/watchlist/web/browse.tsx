import { useEffect, useMemo, useState } from "react";
import { useRouter } from "@cortex/core";
import { Input, Segmented } from "@cortex/ui";
import type { MediaType } from "../shared/types";
import { BASE, MediaGrid } from "./components";
import { discoverPath, listPath, searchPath, useDebounced, useGenres, useInfinite, type DiscoverFilters } from "./data";
import { Frame } from "./views";

const CATEGORIES: Record<MediaType, { value: string; label: string }[]> = {
  movie: [
    { value: "popular", label: "Popular" },
    { value: "trending", label: "Trending" },
    { value: "top_rated", label: "Top rated" },
    { value: "now_playing", label: "In cinemas" },
    { value: "upcoming", label: "Upcoming" },
  ],
  tv: [
    { value: "popular", label: "Popular" },
    { value: "trending", label: "Trending" },
    { value: "top_rated", label: "Top rated" },
    { value: "on_the_air", label: "On the air" },
    { value: "airing_today", label: "Airing today" },
  ],
};

function GenreChips({ type, value, onChange, exclude = [] }: { type: MediaType; value: string; onChange: (g: string) => void; exclude?: number[] }) {
  const genres = (useGenres(type).data ?? []).filter((g) => !exclude.includes(g.id));
  return (
    <div className="wl-chips" role="group" aria-label="Genre">
      <button type="button" className="wl-chip" aria-pressed={!value} onClick={() => onChange("")}>
        All
      </button>
      {genres.map((g) => (
        <button key={g.id} type="button" className="wl-chip" aria-pressed={value === String(g.id)} onClick={() => onChange(value === String(g.id) ? "" : String(g.id))}>
          {g.name}
        </button>
      ))}
    </div>
  );
}

/** Flattens infinite pages for a grid. */
function useGridData(key: unknown[], path: (page: number) => string, enabled = true) {
  const q = useInfinite(key, path, enabled);
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.results) ?? [], [q.data]);
  return { items, hasMore: !!q.hasNextPage, loadMore: () => !q.isFetchingNextPage && q.fetchNextPage(), loading: q.isPending || q.isFetchingNextPage, error: q.error };
}

/** Category and genre live in the query string so "See all" links and bookmarks land on the right list. */
export function useQueryParam(name: string, fallback: string): [string, (v: string) => void] {
  const { path, search, navigate } = useRouter();
  const value = new URLSearchParams(search).get(name) ?? fallback;
  const set = (v: string) => {
    const p = new URLSearchParams(search);
    if (v === fallback) p.delete(name);
    else p.set(name, v);
    navigate(`${path}${p.toString() ? `?${p}` : ""}`, { replace: true });
  };
  return [value, set];
}

export function BrowsePage({ type }: { type: MediaType }) {
  const [category, setCategory] = useQueryParam("category", "popular");
  const [genre, setGenre] = useQueryParam("genre", "");
  // A genre switches to Discover (TMDB's category lists can't filter by genre).
  const grid = useGridData(genre ? ["discover", type, genre, category] : ["list", type, category, "all"], genre ? discoverPath(type, { genre, sort: category === "top_rated" ? "rating" : "popular" }) : listPath(type, category));
  return (
    <Frame crumbs={["Watchlist", type === "movie" ? "Movies" : "TV shows"]}>
      <div className="wl-toolbar">
        <Segmented size="sm" aria-label="Category" options={CATEGORIES[type]} value={category} onChange={setCategory} />
      </div>
      {/* Animation is left out here: anime has its own page. */}
      <GenreChips type={type} value={genre} onChange={setGenre} exclude={[16]} />
      <MediaGrid {...grid} empty="Nothing found." />
    </Frame>
  );
}

export function AnimePage() {
  const [kindRaw, setKind] = useQueryParam("kind", "tv");
  const kind = kindRaw as MediaType;
  const [tab, setTab] = useQueryParam("list", "popular");
  const [genre, setGenre] = useQueryParam("genre", "");
  const f: DiscoverFilters = { anime: true, genre, sort: tab === "top" ? "rating" : tab === "new" ? "newest" : "popular", airing: tab === "airing" && kind === "tv" };
  const grid = useGridData(["anime", kind, tab, genre], discoverPath(kind, f));
  return (
    <Frame crumbs={["Watchlist", "Anime"]}>
      <div className="wl-toolbar">
        <Segmented
          size="sm"
          aria-label="Anime type"
          options={[
            { value: "tv", label: "Series" },
            { value: "movie", label: "Movies" },
          ]}
          value={kind}
          onChange={(v) => setKind(v as MediaType)}
        />
        <Segmented
          size="sm"
          aria-label="Anime list"
          options={[
            { value: "popular", label: "Popular" },
            ...(kind === "tv" ? [{ value: "airing", label: "Airing now" }] : []),
            { value: "top", label: "Top rated" },
            { value: "new", label: "New" },
          ]}
          value={tab === "airing" && kind === "movie" ? "popular" : tab}
          onChange={setTab}
        />
      </div>
      <GenreChips type={kind} value={genre} onChange={setGenre} exclude={[16]} />
      <MediaGrid {...grid} empty="No anime found." />
    </Frame>
  );
}

/* ---------------------------------------------------------------- search */

const SORTS = [
  { value: "popular", label: "Popular" },
  { value: "rating", label: "Top rated" },
  { value: "newest", label: "Newest" },
];

export function SearchPage() {
  const { search, navigate } = useRouter();
  const params = new URLSearchParams(search);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [type, setType] = useState(params.get("type") ?? "all");
  const [genre, setGenre] = useState(params.get("genre") ?? "");
  const [yr, setYr] = useState(params.get("year") ?? "");
  const [minRating, setMinRating] = useState(params.get("rating") ?? "");
  const [sort, setSort] = useState(params.get("sort") ?? "popular");
  const dq = useDebounced(q.trim());

  // The topbar search box navigates here with ?q=…: pick that up.
  useEffect(() => {
    const p = new URLSearchParams(search).get("q") ?? "";
    if (p !== q) setQ(p);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filters live in the URL so searches can be bookmarked and shared.
  useEffect(() => {
    const p = new URLSearchParams();
    if (dq) p.set("q", dq);
    if (type !== "all") p.set("type", type);
    if (genre) p.set("genre", genre);
    if (yr) p.set("year", yr);
    if (minRating) p.set("rating", minRating);
    if (sort !== "popular") p.set("sort", sort);
    const next = `${BASE}/search${p.toString() ? `?${p}` : ""}`;
    navigate(next, { replace: true });
  }, [dq, type, genre, yr, minRating, sort, navigate]);

  // Text search uses TMDB search; no text = browse by filters (Discover).
  const mediaType: MediaType = type === "tv" ? "tv" : "movie";
  const grid = useGridData(
    dq ? ["search", dq, type] : ["discover", mediaType, genre, yr, minRating, sort],
    dq ? searchPath(dq, type === "all" ? "multi" : type) : discoverPath(mediaType, { genre, year: yr, minRating, sort }),
  );
  const years = Array.from({ length: 60 }, (_, i) => String(new Date().getFullYear() + 1 - i));

  return (
    <Frame crumbs={["Watchlist", "Search"]}>
      <div className="wl-search">
        <Input icon="search" placeholder="Title" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" autoFocus />
        <Segmented
          size="sm"
          aria-label="Type"
          options={[
            { value: "all", label: "All" },
            { value: "movie", label: "Movies" },
            { value: "tv", label: "TV" },
          ]}
          value={dq ? type : type === "all" ? "movie" : type}
          onChange={setType}
        />
      </div>
      {!dq && (
        <div className="wl-filters">
          <select className="wl-select" value={yr} onChange={(e) => setYr(e.target.value)} aria-label="Year">
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
          <select className="wl-select" value={minRating} onChange={(e) => setMinRating(e.target.value)} aria-label="Minimum rating">
            <option value="">Any rating</option>
            {[9, 8, 7, 6, 5].map((r) => (
              <option key={r} value={r}>
                ★ {r}+
              </option>
            ))}
          </select>
          <Segmented size="sm" aria-label="Sort" options={SORTS} value={sort} onChange={setSort} />
        </div>
      )}
      {!dq && <GenreChips type={mediaType} value={genre} onChange={setGenre} />}
      {dq && <p className="wl-muted wl-small">Filters apply when browsing without a title. Showing matches for “{dq}”.</p>}
      <MediaGrid {...grid} empty={dq ? `No matches for “${dq}”.` : "Nothing matches these filters."} />
    </Frame>
  );
}
