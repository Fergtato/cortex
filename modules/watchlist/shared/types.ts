/*
 * Watchlist types shared by server and web. TMDB responses are mapped to
 * these on the server; the browser never sees raw TMDB shapes or the key.
 */

export type MediaType = "movie" | "tv";
export type TrackStatus = "watchlist" | "watching" | "completed";

export const STATUS_LABELS: Record<TrackStatus, string> = { watchlist: "Watchlist", watching: "Watching", completed: "Watched" };

export interface Genre {
  id: number;
  name: string;
}

/** The light shape used for cards, rows and lists. */
export interface MediaSummary {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string;
  /** YYYY-MM-DD or "". */
  releaseDate: string;
  rating: number;
  voteCount: number;
  genreIds: number[];
  originalLanguage: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
  episodeCount?: number;
}

export interface SeasonSummary {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterPath: string | null;
}

export interface Episode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
}

export interface NextEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string;
  episodeType: string;
}

export interface MediaDetails extends MediaSummary {
  tagline: string;
  genres: Genre[];
  /** Minutes: the movie, or a typical episode. */
  runtime: number;
  /** TMDB status: "Released", "Returning Series", "Ended", "Canceled"… */
  status: string;
  imdbId: string | null;
  cast: CastMember[];
  trailerKey: string | null;
  recommendations: MediaSummary[];
  seasons: SeasonSummary[];
  numberOfEpisodes: number | null;
  lastAiredEpisode: { seasonNumber: number; episodeNumber: number } | null;
  nextEpisode: NextEpisode | null;
}

export interface Paged<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

export interface PersonCredit extends MediaSummary {
  character: string;
  episodeCount: number | null;
}

export interface PersonDetails {
  id: number;
  name: string;
  profilePath: string | null;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  knownForDepartment: string;
  credits: PersonCredit[];
}

/* ------------------------------------------------------------- library */

/** A tracked title, with the metadata needed to show it without calling TMDB. */
export interface LibraryEntry {
  mediaType: MediaType;
  tmdbId: number;
  status: TrackStatus;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string;
  genreIds: number[];
  originalLanguage: string;
  /** Minutes per movie / per episode. */
  runtime: number;
  /** TV: episodes that have aired so far (excluding specials). */
  airedEpisodes: number | null;
  showStatus: string;
  /** Your rating, 1–10. */
  rating: number | null;
  addedAt: string;
  updatedAt: string;
  /** TV: distinct episodes watched; movies: number of watches. */
  watchedCount: number;
  lastWatchedAt: string | null;
}

export interface WatchEvent {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  season: number | null;
  episode: number | null;
  watchedAt: string;
  runtime: number;
}

export interface CustomListItem {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  addedAt: string;
}

export interface CustomList {
  id: string;
  name: string;
  description: string;
  items: CustomListItem[];
  createdAt: string;
}

export interface LibraryState {
  entries: LibraryEntry[];
  lists: CustomList[];
}

export interface PeriodStats {
  count: number;
  minutes: number;
}

export interface TypeStats {
  week: PeriodStats;
  sixMonths: PeriodStats;
  year: PeriodStats;
  lifetime: PeriodStats;
  /** Last 12 months, oldest first. */
  monthly: { month: string; minutes: number; count: number }[];
  topGenres: { id: number; count: number }[];
}

export interface Stats {
  movie: TypeStats;
  tv: TypeStats;
  recent: (WatchEvent & { title: string; posterPath: string | null })[];
}

export interface UpcomingItem {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  next: NextEpisode;
}

export interface WatchlistConfig {
  /** A TMDB key is set (env or Settings). */
  configured: boolean;
  /** Where poster/backdrop images load from. */
  imageBase: string;
  /** The person may set the key (admin, and not fixed by env). */
  canConfigure: boolean;
  fromEnv: boolean;
  /** The person may change instance settings such as the region. */
  isAdmin: boolean;
  region: string;
}

/** Is it anime? (Japanese animation: kept out of Movies/TV, shown on its own page.) */
export const isAnime = (m: { genreIds: number[]; originalLanguage: string }) => m.genreIds.includes(16) && m.originalLanguage === "ja";
