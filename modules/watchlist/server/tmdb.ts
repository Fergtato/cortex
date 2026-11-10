import type { CastMember, Episode, Genre, MediaDetails, MediaSummary, MediaType, NextEpisode, Paged, PersonDetails, SeasonSummary } from "../shared/types";

/*
 * TMDB client for the Watchlist server. The key never reaches the browser:
 * the server calls TMDB, caches responses in memory, and maps them to the
 * clean types in ../shared/types. Both key kinds work: a v4 "API Read Access
 * Token" (sent as a Bearer header) or a v3 API key (sent as ?api_key=).
 */

export const TMDB_BASE = (process.env.TMDB_API_BASE ?? "https://api.themoviedb.org/3").replace(/\/+$/, "");
export const TMDB_IMAGE_BASE = (process.env.TMDB_IMAGE_BASE ?? "https://image.tmdb.org/t/p").replace(/\/+$/, "");

export class TmdbError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------- cache

interface CacheEntry {
  at: number;
  ttl: number;
  value: unknown;
}
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_ENTRIES = 3000;

function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return undefined;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: unknown, ttl: number) {
  cache.set(key, { at: Date.now(), ttl, value });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!);
}

export const TTL = { list: 60 * 60_000, details: 12 * 60 * 60_000, genres: 7 * 24 * 60 * 60_000, search: 15 * 60_000 };

/** GET a TMDB path (with query), cached. `key` is the configured TMDB credential. */
export async function tmdbGet<T>(apiKey: string, path: string, params: Record<string, string | number | undefined>, ttl: number): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const isBearer = apiKey.startsWith("eyJ");
  if (!isBearer) qs.set("api_key", apiKey);
  const url = `${TMDB_BASE}${path}?${qs}`;
  const cacheKey = `${path}?${[...qs.entries()].filter(([k]) => k !== "api_key").map(([k, v]) => `${k}=${v}`).sort().join("&")}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit as T;
  const pending = inflight.get(cacheKey);
  if (pending) return pending as Promise<T>;
  const p = (async () => {
    const res = await fetch(url, {
      headers: { accept: "application/json", ...(isBearer ? { authorization: `Bearer ${apiKey}` } : {}) },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { status_message?: string };
      throw new TmdbError(res.status, body.status_message ?? `TMDB error ${res.status}`);
    }
    const json = await res.json();
    cacheSet(cacheKey, json, ttl);
    return json;
  })().finally(() => inflight.delete(cacheKey));
  inflight.set(cacheKey, p);
  return p as Promise<T>;
}

// -------------------------------------------------------------- mappers

type Raw = Record<string, any>;

export function toSummary(r: Raw, fallbackType?: MediaType): MediaSummary | null {
  const mediaType: MediaType | undefined = r.media_type === "movie" || r.media_type === "tv" ? r.media_type : fallbackType;
  if (!mediaType) return null; // people in multi-search, etc.
  return {
    id: r.id,
    mediaType,
    title: (mediaType === "movie" ? r.title : r.name) ?? r.title ?? r.name ?? "Untitled",
    posterPath: r.poster_path ?? null,
    backdropPath: r.backdrop_path ?? null,
    overview: r.overview ?? "",
    releaseDate: (mediaType === "movie" ? r.release_date : r.first_air_date) ?? "",
    rating: Math.round((r.vote_average ?? 0) * 10) / 10,
    voteCount: r.vote_count ?? 0,
    genreIds: r.genre_ids ?? (r.genres ?? []).map((g: Genre) => g.id),
    originalLanguage: r.original_language ?? "",
  };
}

export function toPaged(r: Raw, fallbackType?: MediaType, filter?: (m: MediaSummary) => boolean): Paged<MediaSummary> {
  const results = ((r.results ?? []) as Raw[]).map((x) => toSummary(x, fallbackType)).filter((x): x is MediaSummary => !!x && (!filter || filter(x)));
  return { page: r.page ?? 1, totalPages: Math.min(r.total_pages ?? 1, 500), totalResults: r.total_results ?? results.length, results };
}

const toSeason = (s: Raw): SeasonSummary => ({
  seasonNumber: s.season_number,
  name: s.name ?? `Season ${s.season_number}`,
  episodeCount: s.episode_count ?? 0,
  airDate: s.air_date ?? null,
  posterPath: s.poster_path ?? null,
});

export const toEpisode = (e: Raw): Episode => ({
  id: e.id,
  seasonNumber: e.season_number,
  episodeNumber: e.episode_number,
  name: e.name ?? `Episode ${e.episode_number}`,
  overview: e.overview ?? "",
  airDate: e.air_date ?? null,
  runtime: e.runtime ?? null,
  stillPath: e.still_path ?? null,
});

const toNext = (e: Raw | null | undefined): NextEpisode | null =>
  e && e.air_date ? { seasonNumber: e.season_number, episodeNumber: e.episode_number, name: e.name ?? "", airDate: e.air_date, episodeType: e.episode_type ?? "standard" } : null;

export function toDetails(r: Raw, mediaType: MediaType): MediaDetails {
  const base = toSummary({ ...r, media_type: mediaType })!;
  const credits = mediaType === "tv" ? (r.aggregate_credits ?? r.credits) : r.credits;
  const cast: CastMember[] = ((credits?.cast ?? []) as Raw[]).slice(0, 20).map((c) => ({
    id: c.id,
    name: c.name,
    character: c.character ?? c.roles?.[0]?.character ?? "",
    profilePath: c.profile_path ?? null,
    ...(c.total_episode_count ? { episodeCount: c.total_episode_count } : {}),
  }));
  const videos = ((r.videos?.results ?? []) as Raw[]).filter((v) => v.site === "YouTube");
  const trailer = videos.find((v) => v.type === "Trailer" && v.official) ?? videos.find((v) => v.type === "Trailer") ?? videos[0];
  const runtime = mediaType === "movie" ? (r.runtime ?? 0) : (r.episode_run_time?.[0] ?? r.last_episode_to_air?.runtime ?? 0);
  return {
    ...base,
    tagline: r.tagline ?? "",
    genres: r.genres ?? [],
    runtime: runtime || (mediaType === "movie" ? 100 : 40),
    status: r.status ?? "",
    imdbId: r.imdb_id ?? r.external_ids?.imdb_id ?? null,
    cast,
    trailerKey: trailer?.key ?? null,
    recommendations: toPaged(r.recommendations ?? {}, mediaType).results.slice(0, 18),
    seasons: mediaType === "tv" ? ((r.seasons ?? []) as Raw[]).map(toSeason) : [],
    numberOfEpisodes: mediaType === "tv" ? (r.number_of_episodes ?? null) : null,
    lastAiredEpisode: r.last_episode_to_air ? { seasonNumber: r.last_episode_to_air.season_number, episodeNumber: r.last_episode_to_air.episode_number } : null,
    nextEpisode: toNext(r.next_episode_to_air),
  };
}

/** Episodes aired so far, specials (season 0) excluded. */
export function airedEpisodeCount(d: MediaDetails): number | null {
  if (d.mediaType !== "tv") return null;
  const last = d.lastAiredEpisode;
  if (!last) return 0;
  let n = 0;
  for (const s of d.seasons) {
    if (s.seasonNumber <= 0) continue;
    if (s.seasonNumber < last.seasonNumber) n += s.episodeCount;
    else if (s.seasonNumber === last.seasonNumber) n += last.episodeNumber;
  }
  return n;
}

export function toPerson(r: Raw): PersonDetails {
  const seen = new Set<string>();
  const credits = ((r.combined_credits?.cast ?? []) as Raw[])
    // Talk shows, award shows and "Himself" cameos crowd out real roles.
    .filter((c) => !/^(himself|herself|themselves|self)\b/i.test(c.character ?? "") && !(c.genre_ids ?? []).some((g: number) => g === 10767 || g === 10763))
    .map((c) => {
      const s = toSummary(c);
      return s ? { ...s, character: c.character ?? "", episodeCount: c.episode_count ?? null } : null;
    })
    .filter((c): c is NonNullable<typeof c> => {
      if (!c) return false;
      const k = `${c.mediaType}:${c.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.voteCount - a.voteCount);
  return {
    id: r.id,
    name: r.name,
    profilePath: r.profile_path ?? null,
    biography: r.biography ?? "",
    birthday: r.birthday ?? null,
    deathday: r.deathday ?? null,
    placeOfBirth: r.place_of_birth ?? null,
    knownForDepartment: r.known_for_department ?? "",
    credits: credits.slice(0, 40),
  };
}
