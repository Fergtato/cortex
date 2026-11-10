import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@cortex/core";
import type {
  Episode,
  Genre,
  LibraryEntry,
  LibraryState,
  MediaDetails,
  MediaSummary,
  MediaType,
  Paged,
  PersonDetails,
  Stats,
  TrackStatus,
  UpcomingItem,
  WatchEvent,
  WatchlistConfig,
} from "../shared/types";

/*
 * Watchlist data on the client. TMDB lookups are cached generously (they
 * rarely change); library writes invalidate ["watchlist","lib"] so cards,
 * shelves, stats and widgets all refresh together.
 */

const W = "/watchlist";
const LIB = ["watchlist", "lib"] as const;

export function useConfig() {
  return useQuery({ queryKey: ["watchlist", "config"], queryFn: () => api<WatchlistConfig>(`${W}/config`), staleTime: 5 * 60_000 });
}

export function useLibrary() {
  return useQuery({ queryKey: [...LIB, "state"], queryFn: () => api<LibraryState>(`${W}/library`) });
}

/** Map of `${type}:${id}` → entry, for status badges on cards. */
export function useEntryMap(): Map<string, LibraryEntry> {
  const entries = useLibrary().data?.entries;
  return useMemo(() => new Map((entries ?? []).map((e) => [`${e.mediaType}:${e.tmdbId}`, e])), [entries]);
}

const TMDB_STALE = 30 * 60_000;

/** Infinite pages from any Paged TMDB endpoint. */
export function useInfinite(key: unknown[], path: (page: number) => string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["watchlist", "tmdb", ...key],
    queryFn: ({ pageParam }) => api<Paged<MediaSummary>>(path(pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    staleTime: TMDB_STALE,
    enabled,
  });
}

export const listPath = (type: MediaType, category: string) => (page: number) => `${W}/tmdb/list/${type}/${category}?page=${page}`;

export interface DiscoverFilters {
  genre?: string;
  year?: string;
  minRating?: string;
  sort?: string;
  anime?: boolean;
  airing?: boolean;
}

export const discoverPath = (type: MediaType, f: DiscoverFilters) => (page: number) => {
  const p = new URLSearchParams({ page: String(page) });
  if (f.genre) p.set("genre", f.genre);
  if (f.year) p.set("year", f.year);
  if (f.minRating) p.set("minRating", f.minRating);
  if (f.sort) p.set("sort", f.sort);
  if (f.anime) p.set("anime", "1");
  if (f.airing) p.set("airing", "1");
  return `${W}/tmdb/discover/${type}?${p}`;
};

export const searchPath = (q: string, type: string) => (page: number) => `${W}/tmdb/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`;

export function useFirstPage(key: unknown[], path: string) {
  return useQuery({ queryKey: ["watchlist", "tmdb", ...key], queryFn: () => api<Paged<MediaSummary>>(path), staleTime: TMDB_STALE });
}

export function useGenres(type: MediaType) {
  return useQuery({ queryKey: ["watchlist", "tmdb", "genres", type], queryFn: () => api<Genre[]>(`${W}/tmdb/genres/${type}`), staleTime: Infinity });
}

/** Every genre name by id, movie and TV merged. */
export function useGenreNames(): Map<number, string> {
  const m = useGenres("movie");
  const t = useGenres("tv");
  return new Map([...(m.data ?? []), ...(t.data ?? [])].map((g) => [g.id, g.name]));
}

export function useDetails(type: MediaType, id: number) {
  return useQuery({ queryKey: ["watchlist", "tmdb", "details", type, id], queryFn: () => api<MediaDetails>(`${W}/tmdb/details/${type}/${id}`), staleTime: TMDB_STALE });
}

export function useSeason(id: number, season: number, enabled: boolean) {
  return useQuery({ queryKey: ["watchlist", "tmdb", "season", id, season], queryFn: () => api<Episode[]>(`${W}/tmdb/season/${id}/${season}`), staleTime: TMDB_STALE, enabled });
}

export function usePerson(id: number | null) {
  return useQuery({ queryKey: ["watchlist", "tmdb", "person", id], queryFn: () => api<PersonDetails>(`${W}/tmdb/person/${id}`), staleTime: TMDB_STALE, enabled: id !== null });
}

export function useEvents(type: MediaType, id: number) {
  return useQuery({ queryKey: [...LIB, "events", type, id], queryFn: () => api<WatchEvent[]>(`${W}/library/${type}/${id}/events`) });
}

export function useStats() {
  return useQuery({ queryKey: [...LIB, "stats"], queryFn: () => api<Stats>(`${W}/stats`) });
}

export function useUpcoming(enabled = true) {
  return useQuery({ queryKey: [...LIB, "upcoming"], queryFn: () => api<UpcomingItem[]>(`${W}/upcoming`), staleTime: 15 * 60_000, enabled });
}

export function useRecommended(enabled = true) {
  return useQuery({ queryKey: [...LIB, "recommended"], queryFn: () => api<MediaSummary[]>(`${W}/recommended`), staleTime: 15 * 60_000, enabled });
}

/** A write to the library that refreshes everything built from it. */
export function useLibMutation<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: LIB }) });
}

export const libApi = {
  setStatus: (type: MediaType, id: number, status: TrackStatus) => api<LibraryEntry>(`${W}/library/${type}/${id}`, { method: "PUT", json: { status } }),
  rate: (type: MediaType, id: number, rating: number | null) => api(`${W}/library/${type}/${id}`, { method: "PATCH", json: { rating } }),
  remove: (type: MediaType, id: number) => api(`${W}/library/${type}/${id}`, { method: "DELETE" }),
  watchMovie: (id: number) => api(`${W}/library/movie/${id}/watch`, { method: "POST", json: {} }),
  watchEpisodes: (id: number, episodes: { season: number; episode: number }[]) => api(`${W}/library/tv/${id}/watch`, { method: "POST", json: { episodes } }),
  unwatchEpisodes: (id: number, episodes: { season: number; episode: number }[]) => api(`${W}/library/tv/${id}/unwatch`, { method: "POST", json: { episodes } }),
  markAll: (id: number, season?: number) => api<{ added: number }>(`${W}/library/tv/${id}/mark-all`, { method: "POST", json: season === undefined ? {} : { season } }),
  deleteEvent: (id: string) => api(`${W}/events/${id}`, { method: "DELETE" }),
  createList: (name: string) => api<{ id: string }>(`${W}/lists`, { method: "POST", json: { name } }),
  renameList: (id: string, name: string) => api(`${W}/lists/${id}`, { method: "PATCH", json: { name } }),
  deleteList: (id: string) => api(`${W}/lists/${id}`, { method: "DELETE" }),
  addToList: (listId: string, m: { mediaType: MediaType; tmdbId: number; title: string; posterPath: string | null; releaseDate: string }) =>
    api(`${W}/lists/${listId}/items`, { method: "PUT", json: m }),
  removeFromList: (listId: string, type: MediaType, tmdbId: number) => api(`${W}/lists/${listId}/items/${type}/${tmdbId}`, { method: "DELETE" }),
};

/** "Watched" for a whole title: movies log a viewing; TV marks every aired episode (smart status follows). */
export async function markWatched(m: { mediaType: MediaType; id: number }) {
  if (m.mediaType === "movie") return libApi.setStatus("movie", m.id, "completed");
  return libApi.markAll(m.id);
}
