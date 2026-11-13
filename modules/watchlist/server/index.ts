import { Hono, type Context } from "hono";
import type { Kysely } from "kysely";
import { z } from "zod";
import { forUser, newId, type AppEnv, type CortexServerModule, type ServerContext } from "@cortex/core/server";
import type { CustomList, LibraryEntry, LibraryState, MediaDetails, MediaSummary, MediaType, Stats, TrackStatus, TypeStats, UpcomingItem, WatchEvent, WatchlistConfig } from "../shared/types";
import { isAnime } from "../shared/types";
import { plexBase, PlexError, plexSections, plexWatched, type PlexIds, type PlexSection } from "./plex";
import { airedEpisodeCount, TMDB_IMAGE_BASE, TmdbError, tmdbGet, toDetails, toEpisode, toPaged, toPerson, TTL } from "./tmdb";

/*
 * Watchlist server: TMDB (instance key, cached, mapped) plus the person's
 * library in typed tables: entries (status + metadata snapshot), watch events
 * (every movie viewing and episode; all stats come from these) and custom
 * lists. Portable SQL only.
 */

const T = {
  config: "watchlist_config",
  entries: "watchlist_entries",
  events: "watchlist_events",
  lists: "watchlist_lists",
  items: "watchlist_list_items",
  dismissed: "watchlist_dismissed",
} as const;

const num = (v: unknown) => Number(v ?? 0);
const now = () => new Date().toISOString();
const MEDIA = z.enum(["movie", "tv"]);
const STATUS = z.enum(["watchlist", "watching", "completed"]);

// ------------------------------------------------------------- migrations

const migrations = {
  "0001_init": {
    async up(db: Kysely<any>) {
      await db.schema.createTable(T.config).addColumn("key", "text", (c) => c.primaryKey()).addColumn("value", "text", (c) => c.notNull()).execute();
      await db.schema
        .createTable(T.entries)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("media_type", "text", (c) => c.notNull())
        .addColumn("tmdb_id", "integer", (c) => c.notNull())
        .addColumn("status", "text", (c) => c.notNull())
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("poster_path", "text")
        .addColumn("backdrop_path", "text")
        .addColumn("release_date", "text", (c) => c.notNull())
        .addColumn("genre_ids", "text", (c) => c.notNull())
        .addColumn("original_language", "text", (c) => c.notNull())
        .addColumn("runtime", "integer", (c) => c.notNull())
        .addColumn("aired_episodes", "integer")
        .addColumn("show_status", "text", (c) => c.notNull())
        .addColumn("rating", "integer")
        .addColumn("added_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.entries}_pk`, ["user_id", "media_type", "tmdb_id"])
        .execute();
      await db.schema
        .createTable(T.events)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("media_type", "text", (c) => c.notNull())
        .addColumn("tmdb_id", "integer", (c) => c.notNull())
        .addColumn("season", "integer")
        .addColumn("episode", "integer")
        .addColumn("watched_at", "text", (c) => c.notNull())
        .addColumn("runtime", "integer", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.events}_pk`, ["user_id", "id"])
        .execute();
      await db.schema.createIndex(`${T.events}_title_idx`).on(T.events).columns(["user_id", "media_type", "tmdb_id"]).execute();
      await db.schema.createIndex(`${T.events}_time_idx`).on(T.events).columns(["user_id", "watched_at"]).execute();
      await db.schema
        .createTable(T.lists)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("description", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.lists}_pk`, ["user_id", "id"])
        .execute();
      await db.schema
        .createTable(T.items)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("list_id", "text", (c) => c.notNull())
        .addColumn("media_type", "text", (c) => c.notNull())
        .addColumn("tmdb_id", "integer", (c) => c.notNull())
        .addColumn("title", "text", (c) => c.notNull())
        .addColumn("poster_path", "text")
        .addColumn("release_date", "text", (c) => c.notNull())
        .addColumn("added_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.items}_pk`, ["user_id", "list_id", "media_type", "tmdb_id"])
        .execute();
    },
  },
  // Titles skipped in Discover, so they don't come round again.
  "0002_dismissed": {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable(T.dismissed)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("media_type", "text", (c) => c.notNull())
        .addColumn("tmdb_id", "integer", (c) => c.notNull())
        .addColumn("dismissed_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.dismissed}_pk`, ["user_id", "media_type", "tmdb_id"])
        .execute();
    },
  },
};

// ------------------------------------------------------------ TMDB access

let keyCache: { value: string | null } | null = null;

async function tmdbKey(ctx: ServerContext): Promise<string | null> {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY;
  if (keyCache) return keyCache.value;
  const row: any = await ctx.db.selectFrom(T.config).select("value").where("key", "=", "tmdb_key").executeTakeFirst();
  let value: string | null = null;
  try {
    value = row ? ctx.secrets.decrypt(row.value) : null;
  } catch {
    value = null;
  }
  keyCache = { value };
  return value;
}

async function region(ctx: ServerContext): Promise<string> {
  const row: any = await ctx.db.selectFrom(T.config).select("value").where("key", "=", "region").executeTakeFirst();
  return row?.value ?? process.env.TMDB_REGION ?? "GB";
}

class NotConfigured extends Error {}

async function tmdb<T>(ctx: ServerContext, path: string, params: Record<string, string | number | undefined>, ttl: number): Promise<T> {
  const key = await tmdbKey(ctx);
  if (!key) throw new NotConfigured("TMDB isn't set up");
  return tmdbGet<T>(key, path, { language: "en-GB", ...params }, ttl);
}

async function details(ctx: ServerContext, type: MediaType, id: number): Promise<MediaDetails> {
  const append = type === "tv" ? "aggregate_credits,videos,recommendations,external_ids" : "credits,videos,recommendations";
  return toDetails(await tmdb(ctx, `/${type}/${id}`, { append_to_response: append }, TTL.details), type);
}

/** Maps TMDB / config failures to clean JSON errors. */
async function guard(c: Context<AppEnv>, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof NotConfigured) return c.json({ error: "tmdb_not_configured" }, 409);
    if (e instanceof TmdbError) return c.json({ error: e.status === 401 ? "TMDB rejected the API key." : e.message }, e.status === 404 ? 404 : 502);
    if ((e as Error).name === "TimeoutError") return c.json({ error: "TMDB didn't respond in time." }, 504);
    throw e;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- helpers

const toEntry = (r: any, counts?: Map<string, { n: number; last: string }>): LibraryEntry => {
  const k = `${r.media_type}:${r.tmdb_id}`;
  return {
    mediaType: r.media_type,
    tmdbId: num(r.tmdb_id),
    status: r.status,
    title: r.title,
    posterPath: r.poster_path ?? null,
    backdropPath: r.backdrop_path ?? null,
    releaseDate: r.release_date,
    genreIds: JSON.parse(r.genre_ids || "[]"),
    originalLanguage: r.original_language,
    runtime: num(r.runtime),
    airedEpisodes: r.aired_episodes === null || r.aired_episodes === undefined ? null : num(r.aired_episodes),
    showStatus: r.show_status,
    rating: r.rating === null || r.rating === undefined ? null : num(r.rating),
    addedAt: r.added_at,
    updatedAt: r.updated_at,
    watchedCount: counts?.get(k)?.n ?? 0,
    lastWatchedAt: counts?.get(k)?.last ?? null,
  };
};

const toEvent = (r: any): WatchEvent => ({
  id: r.id,
  mediaType: r.media_type,
  tmdbId: num(r.tmdb_id),
  season: r.season === null || r.season === undefined ? null : num(r.season),
  episode: r.episode === null || r.episode === undefined ? null : num(r.episode),
  watchedAt: r.watched_at,
  runtime: num(r.runtime),
});

/** Watched counts per title: distinct episodes for TV (specials excluded), watches for movies. */
async function watchedCounts(db: Kysely<any>, uid: string): Promise<Map<string, { n: number; last: string }>> {
  const rows = (await forUser(db, uid).selectFrom(T.events).select(["media_type", "tmdb_id", "season", "episode", "watched_at"]).execute()) as any[];
  const map = new Map<string, { n: number; last: string; eps: Set<string> }>();
  for (const r of rows) {
    const k = `${r.media_type}:${num(r.tmdb_id)}`;
    const cur = map.get(k) ?? { n: 0, last: "", eps: new Set<string>() };
    if (r.media_type === "tv") {
      if (num(r.season) > 0) cur.eps.add(`${r.season}x${r.episode}`);
      cur.n = cur.eps.size;
    } else cur.n += 1;
    if (r.watched_at > cur.last) cur.last = r.watched_at;
    map.set(k, cur);
  }
  return map as any;
}

/** Creates or refreshes an entry from TMDB details. Keeps the person's status/rating unless `status` is given. */
async function upsertEntry(ctx: ServerContext, uid: string, type: MediaType, id: number, status?: TrackStatus): Promise<LibraryEntry> {
  const d = await details(ctx, type, id);
  const u = forUser(ctx.db, uid);
  const existing: any = await u.selectFrom(T.entries).selectAll().where("media_type", "=", type).where("tmdb_id", "=", id).executeTakeFirst();
  const t = now();
  const meta = {
    title: d.title,
    poster_path: d.posterPath,
    backdrop_path: d.backdropPath,
    release_date: d.releaseDate,
    genre_ids: JSON.stringify(d.genreIds),
    original_language: d.originalLanguage,
    runtime: d.runtime,
    aired_episodes: airedEpisodeCount(d),
    show_status: d.status,
    updated_at: t,
  };
  if (existing) {
    await u.updateTable(T.entries).set({ ...meta, ...(status ? { status } : {}) }).where("media_type", "=", type).where("tmdb_id", "=", id).execute();
  } else {
    await u.insertInto(T.entries, { media_type: type, tmdb_id: id, status: status ?? "watchlist", rating: null, added_at: t, ...meta }).execute();
  }
  const row = await u.selectFrom(T.entries).selectAll().where("media_type", "=", type).where("tmdb_id", "=", id).executeTakeFirst();
  return toEntry(row);
}

/**
 * Smart status for TV after episodes change: every aired episode watched →
 * "completed" if the show has ended, else "watching" (caught up); some
 * watched → "watching". A show with nothing watched keeps its status.
 */
async function recomputeTv(ctx: ServerContext, uid: string, id: number) {
  const u = forUser(ctx.db, uid);
  const entry: any = await u.selectFrom(T.entries).selectAll().where("media_type", "=", "tv").where("tmdb_id", "=", id).executeTakeFirst();
  if (!entry) return;
  const eps = (await u.selectFrom(T.events).select(["season", "episode"]).where("media_type", "=", "tv").where("tmdb_id", "=", id).where("season", ">", 0).execute()) as any[];
  const watched = new Set(eps.map((e) => `${e.season}x${e.episode}`)).size;
  const aired = entry.aired_episodes === null ? null : num(entry.aired_episodes);
  let status: TrackStatus = entry.status;
  if (aired && watched >= aired) status = ["Ended", "Canceled"].includes(entry.show_status) ? "completed" : "watching";
  else if (watched > 0) status = "watching";
  if (status !== entry.status) await u.updateTable(T.entries).set({ status, updated_at: now() }).where("media_type", "=", "tv").where("tmdb_id", "=", id).execute();
}

const noAnime = (m: MediaSummary) => !isAnime(m);

function emptyType(): TypeStats {
  const z = () => ({ count: 0, minutes: 0 });
  return { week: z(), sixMonths: z(), year: z(), lifetime: z(), monthly: [], topGenres: [] };
}

// ----------------------------------------------------------------- routes

function routes(ctx: ServerContext) {
  const app = new Hono<AppEnv>();
  const bad = (c: Context, msg: string) => c.json({ error: msg }, 400);

  // ---- config (TMDB key is instance-wide; only admins may set it)
  app.get("/config", async (c) => {
    const cfg: WatchlistConfig = {
      configured: !!(await tmdbKey(ctx)),
      imageBase: TMDB_IMAGE_BASE,
      canConfigure: c.get("userRole") === "admin" && !process.env.TMDB_API_KEY,
      fromEnv: !!process.env.TMDB_API_KEY,
      isAdmin: c.get("userRole") === "admin",
      region: await region(ctx),
    };
    return c.json(cfg);
  });

  app.put("/config", async (c) => {
    if (c.get("userRole") !== "admin") return c.json({ error: "Only an admin can change this." }, 403);
    const b = z.object({ apiKey: z.string().trim().max(1000).optional(), region: z.string().regex(/^[A-Z]{2}$/).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Expected { apiKey?, region? }");
    const set = async (key: string, value: string | null) => {
      await ctx.db.deleteFrom(T.config).where("key", "=", key).execute();
      if (value !== null) await ctx.db.insertInto(T.config).values({ key, value }).execute();
    };
    if (b.data.apiKey !== undefined) {
      if (b.data.apiKey) {
        // Check the key against TMDB before saving it.
        try {
          await tmdbGet(b.data.apiKey, "/configuration", {}, 1);
        } catch (e) {
          return c.json({ error: e instanceof TmdbError && e.status === 401 ? "TMDB rejected that key." : `Couldn't reach TMDB: ${(e as Error).message}` }, 400);
        }
      }
      await set("tmdb_key", b.data.apiKey ? ctx.secrets.encrypt(b.data.apiKey) : null);
      keyCache = null;
    }
    if (b.data.region) await set("region", b.data.region);
    return c.json({ ok: true });
  });

  // ---- TMDB (mapped)
  const MOVIE_LISTS = ["popular", "top_rated", "upcoming", "now_playing", "trending"];
  const TV_LISTS = ["popular", "top_rated", "on_the_air", "airing_today", "trending"];

  app.get("/tmdb/list/:type/:category", (c) =>
    guard(c, async () => {
      const type = MEDIA.parse(c.req.param("type"));
      const category = c.req.param("category");
      if (!(type === "movie" ? MOVIE_LISTS : TV_LISTS).includes(category)) return bad(c, "Unknown list");
      const page = Number(c.req.query("page")) || 1;
      const path = category === "trending" ? `/trending/${type}/week` : `/${type}/${category}`;
      const raw = await tmdb<any>(ctx, path, { page, region: category === "upcoming" || category === "now_playing" ? await region(ctx) : undefined }, TTL.list);
      return c.json(toPaged(raw, type, noAnime));
    }),
  );

  app.get("/tmdb/trending", (c) =>
    guard(c, async () => c.json(toPaged(await tmdb<any>(ctx, "/trending/all/week", { page: Number(c.req.query("page")) || 1 }, TTL.list), undefined, noAnime))),
  );

  /** Discover with filters. `anime=1` restricts to Japanese animation; otherwise anime is left out. */
  app.get("/tmdb/discover/:type", (c) =>
    guard(c, async () => {
      const type = MEDIA.parse(c.req.param("type"));
      const q = c.req.query();
      const anime = q.anime === "1";
      const sorts: Record<string, string> = { popular: "popularity.desc", rating: "vote_average.desc", newest: type === "movie" ? "primary_release_date.desc" : "first_air_date.desc", title: type === "movie" ? "title.asc" : "name.asc" };
      const params: Record<string, string | number | undefined> = {
        page: Number(q.page) || 1,
        sort_by: sorts[q.sort ?? "popular"] ?? sorts.popular,
        with_genres: anime ? [16, q.genre].filter(Boolean).join(",") : q.genre || undefined,
        with_original_language: anime ? "ja" : undefined,
        "vote_average.gte": q.minRating || undefined,
        // Rating/newest sorts drown in obscure titles without a vote floor.
        "vote_count.gte": q.sort === "rating" ? 200 : q.sort === "newest" ? 10 : undefined,
        [type === "movie" ? "primary_release_year" : "first_air_date_year"]: q.year || undefined,
        [type === "movie" ? "primary_release_date.lte" : "first_air_date.lte"]: q.sort === "newest" ? today() : undefined,
        with_status: anime && q.airing === "1" ? "0" : undefined,
      };
      const raw = await tmdb<any>(ctx, `/discover/${type}`, params, TTL.list);
      return c.json(toPaged(raw, type, anime ? undefined : noAnime));
    }),
  );

  app.get("/tmdb/search", (c) =>
    guard(c, async () => {
      const q = (c.req.query("q") ?? "").trim();
      if (!q) return c.json({ page: 1, totalPages: 0, totalResults: 0, results: [] });
      const type = c.req.query("type");
      const path = type === "movie" || type === "tv" ? `/search/${type}` : "/search/multi";
      const raw = await tmdb<any>(ctx, path, { query: q, page: Number(c.req.query("page")) || 1, include_adult: "false" }, TTL.search);
      return c.json(toPaged(raw, type === "movie" || type === "tv" ? type : undefined));
    }),
  );

  app.get("/tmdb/genres/:type", (c) =>
    guard(c, async () => {
      const type = MEDIA.parse(c.req.param("type"));
      return c.json(((await tmdb<any>(ctx, `/genre/${type}/list`, {}, TTL.genres)).genres ?? []) as { id: number; name: string }[]);
    }),
  );

  app.get("/tmdb/details/:type/:id", (c) => guard(c, async () => c.json(await details(ctx, MEDIA.parse(c.req.param("type")), Number(c.req.param("id"))))));

  app.get("/tmdb/season/:id/:season", (c) =>
    guard(c, async () => {
      const raw = await tmdb<any>(ctx, `/tv/${Number(c.req.param("id"))}/season/${Number(c.req.param("season"))}`, {}, TTL.details);
      return c.json(((raw.episodes ?? []) as any[]).map(toEpisode));
    }),
  );

  app.get("/tmdb/person/:id", (c) => guard(c, async () => c.json(toPerson(await tmdb<any>(ctx, `/person/${Number(c.req.param("id"))}`, { append_to_response: "combined_credits" }, TTL.details)))));

  // ---- library
  app.get("/library", async (c) => {
    const uid = c.get("userId");
    const u = forUser(ctx.db, uid);
    const counts = await watchedCounts(ctx.db, uid);
    const entries = ((await u.selectFrom(T.entries).selectAll().orderBy("updated_at", "desc").execute()) as any[]).map((r) => toEntry(r, counts));
    const lists = (await u.selectFrom(T.lists).selectAll().orderBy("created_at").execute()) as any[];
    const items = (await u.selectFrom(T.items).selectAll().orderBy("added_at", "desc").execute()) as any[];
    const state: LibraryState = {
      entries,
      lists: lists.map(
        (l): CustomList => ({
          id: l.id,
          name: l.name,
          description: l.description,
          createdAt: l.created_at,
          items: items.filter((i) => i.list_id === l.id).map((i) => ({ mediaType: i.media_type, tmdbId: num(i.tmdb_id), title: i.title, posterPath: i.poster_path ?? null, releaseDate: i.release_date, addedAt: i.added_at })),
        }),
      ),
    };
    return c.json(state);
  });

  /** Set status (adds the title if needed). `completed` on a movie with no watches logs one. */
  app.put("/library/:type/:id", (c) =>
    guard(c, async () => {
      const type = MEDIA.parse(c.req.param("type"));
      const id = Number(c.req.param("id"));
      const b = z.object({ status: STATUS }).safeParse(await c.req.json().catch(() => null));
      if (!b.success) return bad(c, "Expected { status }");
      const uid = c.get("userId");
      const entry = await upsertEntry(ctx, uid, type, id, b.data.status);
      if (type === "movie" && b.data.status === "completed") {
        const u = forUser(ctx.db, uid);
        const has = await u.selectFrom(T.events).select("id").where("media_type", "=", "movie").where("tmdb_id", "=", id).limit(1).execute();
        if (!has.length) await u.insertInto(T.events, { id: newId(), media_type: "movie", tmdb_id: id, season: null, episode: null, watched_at: now(), runtime: entry.runtime }).execute();
      }
      return c.json(entry);
    }),
  );

  app.patch("/library/:type/:id", async (c) => {
    const type = MEDIA.parse(c.req.param("type"));
    const b = z.object({ rating: z.number().int().min(1).max(10).nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Expected { rating }");
    await forUser(ctx.db, c.get("userId")).updateTable(T.entries).set({ rating: b.data.rating, updated_at: now() }).where("media_type", "=", type).where("tmdb_id", "=", Number(c.req.param("id"))).execute();
    return c.json({ ok: true });
  });

  /** Removes the title and its watch history. */
  app.delete("/library/:type/:id", async (c) => {
    const type = MEDIA.parse(c.req.param("type"));
    const id = Number(c.req.param("id"));
    const u = forUser(ctx.db, c.get("userId"));
    await u.deleteFrom(T.events).where("media_type", "=", type).where("tmdb_id", "=", id).execute();
    await u.deleteFrom(T.entries).where("media_type", "=", type).where("tmdb_id", "=", id).execute();
    return c.body(null, 204);
  });

  app.get("/library/:type/:id/events", async (c) => {
    const type = MEDIA.parse(c.req.param("type"));
    const rows = await forUser(ctx.db, c.get("userId")).selectFrom(T.events).selectAll().where("media_type", "=", type).where("tmdb_id", "=", Number(c.req.param("id"))).orderBy("watched_at", "desc").execute();
    return c.json(rows.map(toEvent));
  });

  const episodesBody = z.object({ episodes: z.array(z.object({ season: z.number().int().min(0), episode: z.number().int().min(1) })).max(5000) });

  /**
   * Log a watch. Movies: one viewing (a rewatch if there are others). TV:
   * `episodes` (each logged once more, so this also records rewatches).
   */
  app.post("/library/:type/:id/watch", (c) =>
    guard(c, async () => {
      const type = MEDIA.parse(c.req.param("type"));
      const id = Number(c.req.param("id"));
      const uid = c.get("userId");
      const u = forUser(ctx.db, uid);
      const body = await c.req.json().catch(() => ({}));
      let entry: any = await u.selectFrom(T.entries).selectAll().where("media_type", "=", type).where("tmdb_id", "=", id).executeTakeFirst();
      if (!entry) entry = await upsertEntry(ctx, uid, type, id, type === "movie" ? "completed" : "watching");
      const runtime = num(entry.runtime);
      const at = typeof body.watchedAt === "string" && !Number.isNaN(Date.parse(body.watchedAt)) ? new Date(body.watchedAt).toISOString() : now();
      if (type === "movie") {
        await u.insertInto(T.events, { id: newId(), media_type: "movie", tmdb_id: id, season: null, episode: null, watched_at: at, runtime }).execute();
        await u.updateTable(T.entries).set({ status: "completed", updated_at: now() }).where("media_type", "=", "movie").where("tmdb_id", "=", id).execute();
        return c.json({ ok: true });
      }
      const b = episodesBody.safeParse(body);
      if (!b.success) return bad(c, "Expected { episodes: [{ season, episode }] }");
      // Episodes run different lengths; take each one's runtime from its season (cached).
      const lengths = new Map<string, number>();
      for (const season of new Set(b.data.episodes.map((e) => e.season))) {
        try {
          const raw = await tmdb<any>(ctx, `/tv/${id}/season/${season}`, {}, TTL.details);
          for (const e of (raw.episodes ?? []) as any[]) if (e.runtime) lengths.set(`${season}x${e.episode_number}`, e.runtime);
        } catch {
          /* TMDB unreachable: fall back to the show's typical runtime */
        }
      }
      for (const e of b.data.episodes) {
        const length = lengths.get(`${e.season}x${e.episode}`) ?? runtime;
        await u.insertInto(T.events, { id: newId(), media_type: "tv", tmdb_id: id, season: e.season, episode: e.episode, watched_at: at, runtime: length }).execute();
      }
      await recomputeTv(ctx, uid, id);
      return c.json({ ok: true });
    }),
  );

  /** TV: mark episodes as not watched (removes every viewing of them). */
  app.post("/library/tv/:id/unwatch", async (c) => {
    const id = Number(c.req.param("id"));
    const b = episodesBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Expected { episodes }");
    const uid = c.get("userId");
    const u = forUser(ctx.db, uid);
    for (const e of b.data.episodes) {
      await u.deleteFrom(T.events).where("media_type", "=", "tv").where("tmdb_id", "=", id).where("season", "=", e.season).where("episode", "=", e.episode).execute();
    }
    await recomputeTv(ctx, uid, id);
    return c.json({ ok: true });
  });

  /** TV: mark every aired, unwatched episode (of one season, or the whole show) as watched. */
  app.post("/library/tv/:id/mark-all", (c) =>
    guard(c, async () => {
      const id = Number(c.req.param("id"));
      const uid = c.get("userId");
      const body = await c.req.json().catch(() => ({}));
      const onlySeason = Number.isInteger(body.season) ? (body.season as number) : null;
      const entry = await upsertEntry(ctx, uid, "tv", id);
      const d = await details(ctx, "tv", id);
      const u = forUser(ctx.db, uid);
      const watched = new Set(((await u.selectFrom(T.events).select(["season", "episode"]).where("media_type", "=", "tv").where("tmdb_id", "=", id).execute()) as any[]).map((e) => `${e.season}x${e.episode}`));
      const day = today();
      let added = 0;
      const t = now();
      for (const s of d.seasons) {
        if (s.seasonNumber <= 0 || (onlySeason !== null && s.seasonNumber !== onlySeason)) continue;
        const raw = await tmdb<any>(ctx, `/tv/${id}/season/${s.seasonNumber}`, {}, TTL.details);
        for (const e of (raw.episodes ?? []) as any[]) {
          if (!e.air_date || e.air_date > day || watched.has(`${s.seasonNumber}x${e.episode_number}`)) continue;
          await u.insertInto(T.events, { id: newId(), media_type: "tv", tmdb_id: id, season: s.seasonNumber, episode: e.episode_number, watched_at: t, runtime: e.runtime ?? entry.runtime }).execute();
          added++;
        }
      }
      await recomputeTv(ctx, uid, id);
      return c.json({ added });
    }),
  );

  app.delete("/events/:id", async (c) => {
    const uid = c.get("userId");
    const u = forUser(ctx.db, uid);
    const ev: any = await u.selectFrom(T.events).select(["media_type", "tmdb_id"]).where("id", "=", c.req.param("id")).executeTakeFirst();
    if (!ev) return c.json({ error: "Not found" }, 404);
    await u.deleteFrom(T.events).where("id", "=", c.req.param("id")).execute();
    if (ev.media_type === "tv") await recomputeTv(ctx, uid, num(ev.tmdb_id));
    return c.body(null, 204);
  });

  // ---- custom lists
  app.post("/lists", async (c) => {
    const b = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Give the list a name.");
    const id = newId();
    await forUser(ctx.db, c.get("userId")).insertInto(T.lists, { id, name: b.data.name, description: b.data.description ?? "", created_at: now() }).execute();
    return c.json({ id }, 201);
  });
  app.patch("/lists/:id", async (c) => {
    const b = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).optional() }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Invalid list");
    await forUser(ctx.db, c.get("userId")).updateTable(T.lists).set(b.data).where("id", "=", c.req.param("id")).execute();
    return c.json({ ok: true });
  });
  app.delete("/lists/:id", async (c) => {
    const u = forUser(ctx.db, c.get("userId"));
    await u.deleteFrom(T.items).where("list_id", "=", c.req.param("id")).execute();
    await u.deleteFrom(T.lists).where("id", "=", c.req.param("id")).execute();
    return c.body(null, 204);
  });
  app.put("/lists/:id/items", async (c) => {
    const b = z
      .object({ mediaType: MEDIA, tmdbId: z.number().int().positive(), title: z.string().max(300), posterPath: z.string().max(300).nullable(), releaseDate: z.string().max(10) })
      .safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Invalid item");
    const u = forUser(ctx.db, c.get("userId"));
    const list = await u.selectFrom(T.lists).select("id").where("id", "=", c.req.param("id")).executeTakeFirst();
    if (!list) return c.json({ error: "Unknown list" }, 404);
    await u.deleteFrom(T.items).where("list_id", "=", c.req.param("id")).where("media_type", "=", b.data.mediaType).where("tmdb_id", "=", b.data.tmdbId).execute();
    await u
      .insertInto(T.items, { list_id: c.req.param("id"), media_type: b.data.mediaType, tmdb_id: b.data.tmdbId, title: b.data.title, poster_path: b.data.posterPath, release_date: b.data.releaseDate, added_at: now() })
      .execute();
    return c.json({ ok: true });
  });
  app.delete("/lists/:id/items/:type/:tmdbId", async (c) => {
    await forUser(ctx.db, c.get("userId"))
      .deleteFrom(T.items)
      .where("list_id", "=", c.req.param("id"))
      .where("media_type", "=", c.req.param("type"))
      .where("tmdb_id", "=", Number(c.req.param("tmdbId")))
      .execute();
    return c.body(null, 204);
  });

  // ---- stats (computed from watch events)
  app.get("/stats", async (c) => {
    const uid = c.get("userId");
    const u = forUser(ctx.db, uid);
    const events = ((await u.selectFrom(T.events).selectAll().orderBy("watched_at", "desc").execute()) as any[]).map(toEvent);
    const entries = new Map(((await u.selectFrom(T.entries).selectAll().execute()) as any[]).map((r) => [`${r.media_type}:${num(r.tmdb_id)}`, toEntry(r)]));
    const nowMs = Date.now();
    const day = 86_400_000;
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - (11 - i));
      return d.toISOString().slice(0, 7);
    });
    const stats: Stats = { movie: emptyType(), tv: emptyType(), recent: [] };
    for (const type of ["movie", "tv"] as const) {
      const s = stats[type];
      const evs = events.filter((e) => e.mediaType === type);
      const add = (p: { count: number; minutes: number }, e: WatchEvent) => {
        p.count++;
        p.minutes += e.runtime;
      };
      const genreCount = new Map<number, number>();
      const seenTitles = new Set<number>();
      for (const e of evs) {
        const age = nowMs - Date.parse(e.watchedAt);
        add(s.lifetime, e);
        if (age <= 7 * day) add(s.week, e);
        if (age <= 182 * day) add(s.sixMonths, e);
        if (age <= 365 * day) add(s.year, e);
        // Genres per title (a 60-episode show counts once, like a movie).
        if (!seenTitles.has(e.tmdbId)) {
          seenTitles.add(e.tmdbId);
          for (const g of entries.get(`${type}:${e.tmdbId}`)?.genreIds ?? []) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
        }
      }
      s.monthly = months.map((m) => {
        const inMonth = evs.filter((e) => e.watchedAt.startsWith(m));
        return { month: m, count: inMonth.length, minutes: inMonth.reduce((n, e) => n + e.runtime, 0) };
      });
      s.topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, count]) => ({ id, count }));
    }
    stats.recent = events.slice(0, 20).map((e) => {
      const en = entries.get(`${e.mediaType}:${e.tmdbId}`);
      return { ...e, title: en?.title ?? "Unknown title", posterPath: en?.posterPath ?? null };
    });
    return c.json(stats);
  });

  // ---- upcoming episodes for shows being followed
  app.get("/upcoming", (c) =>
    guard(c, async () => {
      const uid = c.get("userId");
      const u = forUser(ctx.db, uid);
      const shows = ((await u.selectFrom(T.entries).selectAll().where("media_type", "=", "tv").where("status", "in", ["watching", "completed"]).execute()) as any[]).filter(
        (s) => !["Ended", "Canceled"].includes(s.show_status),
      );
      const out: UpcomingItem[] = [];
      for (let i = 0; i < shows.length; i += 6) {
        const batch = await Promise.all(
          shows.slice(i, i + 6).map(async (s) => {
            try {
              const d = await details(ctx, "tv", num(s.tmdb_id));
              // Keep the snapshot fresh while we're here.
              const aired = airedEpisodeCount(d);
              if (aired !== (s.aired_episodes === null ? null : num(s.aired_episodes)) || d.status !== s.show_status) {
                await u.updateTable(T.entries).set({ aired_episodes: aired, show_status: d.status }).where("media_type", "=", "tv").where("tmdb_id", "=", num(s.tmdb_id)).execute();
              }
              return d.nextEpisode && d.nextEpisode.airDate >= today() ? { tmdbId: d.id, title: d.title, posterPath: d.posterPath, backdropPath: d.backdropPath, next: d.nextEpisode } : null;
            } catch {
              return null;
            }
          }),
        );
        out.push(...batch.filter((x): x is UpcomingItem => !!x));
      }
      out.sort((a, b) => a.next.airDate.localeCompare(b.next.airDate));
      return c.json(out);
    }),
  );

  // ---- recommended for you (from what you've watched)
  app.get("/recommended", (c) =>
    guard(c, async () => {
      const uid = c.get("userId");
      const u = forUser(ctx.db, uid);
      const lib = (await u.selectFrom(T.entries).select(["media_type", "tmdb_id", "status", "rating", "updated_at"]).execute()) as any[];
      const inLib = new Set(lib.map((e) => `${e.media_type}:${num(e.tmdb_id)}`));
      const seeds = lib
        .filter((e) => e.status !== "watchlist" && (e.rating === null || num(e.rating) >= 6))
        .sort((a, b) => num(b.rating) - num(a.rating) || String(b.updated_at).localeCompare(String(a.updated_at)))
        .slice(0, 10);
      const tally = new Map<string, { m: MediaSummary; n: number }>();
      await Promise.all(
        seeds.map(async (s) => {
          try {
            const d = await details(ctx, s.media_type, num(s.tmdb_id));
            for (const r of d.recommendations) {
              const k = `${r.mediaType}:${r.id}`;
              if (inLib.has(k) || isAnime(r)) continue;
              const cur = tally.get(k) ?? { m: r, n: 0 };
              cur.n++;
              tally.set(k, cur);
            }
          } catch {
            /* skip titles TMDB can't return */
          }
        }),
      );
      const results = [...tally.values()].sort((a, b) => b.n - a.n || b.m.rating - a.m.rating).slice(0, 20).map((x) => x.m);
      return c.json(results);
    }),
  );

  // ---- import from Plex (one-off; the token is used for this request only and never stored)
  const plexBody = z.object({ url: z.string().min(1), token: z.string().min(1), sections: z.array(z.string()).optional(), dryRun: z.boolean().optional() });
  const plexGuard = async (c: Context<AppEnv>, fn: () => Promise<Response>) => {
    try {
      return await guard(c, fn);
    } catch (e) {
      if (e instanceof PlexError) return c.json({ error: e.message }, e.status as 400);
      if (e instanceof TypeError) return c.json({ error: "That doesn't look like a server address." }, 400);
      throw e;
    }
  };

  app.post("/import/plex/sections", (c) =>
    plexGuard(c, async () => {
      const b = plexBody.safeParse(await c.req.json().catch(() => null));
      if (!b.success) return bad(c, "Enter the server address and token.");
      return c.json(await plexSections(ctx, plexBase(b.data.url), b.data.token.trim()));
    }),
  );

  /** Resolves Plex ids to a TMDB id: tmdb directly, else TMDB's /find by imdb or tvdb id. */
  const tmdbIdFor = async (ids: PlexIds, type: MediaType): Promise<number | null> => {
    if (ids.tmdb) return ids.tmdb;
    for (const [value, source] of [
      [ids.imdb, "imdb_id"],
      [ids.tvdb, "tvdb_id"],
    ] as const) {
      if (!value) continue;
      const r = await tmdb<any>(ctx, `/find/${value}`, { external_source: source }, TTL.details).catch(() => null);
      const hit = (type === "movie" ? r?.movie_results : r?.tv_results)?.[0];
      if (hit?.id) return Number(hit.id);
    }
    return null;
  };

  app.post("/import/plex", (c) =>
    plexGuard(c, async () => {
      const b = plexBody.safeParse(await c.req.json().catch(() => null));
      if (!b.success || !b.data.sections?.length) return bad(c, "Choose at least one library.");
      const uid = c.get("userId");
      const base = plexBase(b.data.url);
      const token = b.data.token.trim();
      const all = await plexSections(ctx, base, token);
      const chosen: PlexSection[] = all.filter((s) => b.data.sections!.includes(s.id));
      const { movies, shows, episodes } = await plexWatched(ctx, base, token, chosen);
      const u = forUser(ctx.db, uid);
      const have = new Set(
        ((await u.selectFrom(T.events).select(["media_type", "tmdb_id", "season", "episode"]).execute()) as any[]).map((e) => `${e.media_type}:${num(e.tmdb_id)}:${e.season ?? ""}:${e.episode ?? ""}`),
      );
      const unmatched: string[] = [];
      const result = { movies: { watched: movies.length, added: 0 }, shows: { watched: shows.length, added: 0 }, episodes: { watched: episodes.length, added: 0 }, unmatched };

      // Movies: one viewing each, dated when Plex last saw it played; skipped if already logged.
      const movieIds: { id: number; m: (typeof movies)[number] }[] = [];
      for (const m of movies) {
        const id = await tmdbIdFor(m.ids, "movie");
        if (!id) unmatched.push(`${m.title}${m.year ? ` (${m.year})` : ""}`);
        else if (!have.has(`movie:${id}::`) && !movieIds.some((x) => x.id === id)) movieIds.push({ id, m });
      }
      result.movies.added = movieIds.length;

      // TV: map each Plex show to TMDB, then add the episodes not logged yet.
      const showIds = new Map<string, number>();
      for (const sh of shows) {
        const id = await tmdbIdFor(sh.ids, "tv");
        if (id) showIds.set(sh.key, id);
        else unmatched.push(sh.title);
      }
      const newEps = episodes.filter((e) => {
        const id = showIds.get(e.showKey);
        return id !== undefined && !have.has(`tv:${id}:${e.season}:${e.episode}`);
      });
      const touchedShows = new Set(newEps.map((e) => showIds.get(e.showKey)!));
      result.episodes.added = newEps.length;
      result.shows.added = touchedShows.size;
      if (b.data.dryRun) return c.json(result);

      for (const { id, m } of movieIds) {
        try {
          const entry = await upsertEntry(ctx, uid, "movie", id, "completed");
          await u.insertInto(T.events, { id: newId(), media_type: "movie", tmdb_id: id, season: null, episode: null, watched_at: m.viewedAt, runtime: m.minutes || entry.runtime }).execute();
        } catch {
          unmatched.push(m.title);
          result.movies.added--;
        }
      }
      for (const showId of touchedShows) {
        try {
          const entry = await upsertEntry(ctx, uid, "tv", showId);
          for (const e of newEps) {
            if (showIds.get(e.showKey) !== showId) continue;
            await u.insertInto(T.events, { id: newId(), media_type: "tv", tmdb_id: showId, season: e.season, episode: e.episode, watched_at: e.viewedAt, runtime: e.minutes || entry.runtime }).execute();
          }
          await recomputeTv(ctx, uid, showId);
        } catch {
          result.shows.added--;
        }
      }
      return c.json(result);
    }),
  );

  // ---- discover: skipped titles
  app.get("/dismissed", async (c) => {
    const rows = await forUser(ctx.db, c.get("userId")).selectFrom(T.dismissed).select(["media_type", "tmdb_id"]).execute();
    return c.json((rows as any[]).map((r) => `${r.media_type}:${num(r.tmdb_id)}`));
  });
  const dismissBody = z.object({ mediaType: MEDIA, tmdbId: z.number().int() });
  app.post("/dismissed", async (c) => {
    const b = dismissBody.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return bad(c, "Expected { mediaType, tmdbId }");
    const u = forUser(ctx.db, c.get("userId"));
    await u.deleteFrom(T.dismissed).where("media_type", "=", b.data.mediaType).where("tmdb_id", "=", b.data.tmdbId).execute();
    await u.insertInto(T.dismissed, { media_type: b.data.mediaType, tmdb_id: b.data.tmdbId, dismissed_at: now() }).execute();
    return c.json({ ok: true });
  });
  app.delete("/dismissed/:type/:id", async (c) => {
    await forUser(ctx.db, c.get("userId")).deleteFrom(T.dismissed).where("media_type", "=", MEDIA.parse(c.req.param("type"))).where("tmdb_id", "=", Number(c.req.param("id"))).execute();
    return c.json({ ok: true });
  });
  app.delete("/dismissed", async (c) => {
    await forUser(ctx.db, c.get("userId")).deleteFrom(T.dismissed).execute();
    return c.json({ ok: true });
  });

  // ---- backup
  app.get("/backup", async (c) => {
    const u = forUser(ctx.db, c.get("userId"));
    const all = async (t: string) => (await u.selectFrom(t).selectAll().execute()).map(({ user_id: _u, ...rest }: any) => rest);
    return c.json({ entries: await all(T.entries), events: await all(T.events), lists: await all(T.lists), items: await all(T.items), dismissed: await all(T.dismissed) });
  });

  app.post("/backup", async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || (b.mode !== "merge" && b.mode !== "replace") || typeof b.data !== "object") return bad(c, "Expected { mode, data }");
    const tables: [string, string, string[]][] = [
      ["entries", T.entries, ["media_type", "tmdb_id"]],
      ["events", T.events, ["id"]],
      ["lists", T.lists, ["id"]],
      ["items", T.items, ["list_id", "media_type", "tmdb_id"]],
      ["dismissed", T.dismissed, ["media_type", "tmdb_id"]],
    ];
    const uid = c.get("userId");
    const counts: Record<string, number> = {};
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      if (b.mode === "replace") for (const [, t] of tables) await u.deleteFrom(t).execute();
      for (const [key, t, pk] of tables) {
        const rows = Array.isArray(b.data[key]) ? b.data[key] : [];
        counts[key] = rows.length;
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const { user_id: _u, ...values } = row;
          let del = u.deleteFrom(t);
          for (const k of pk) del = del.where(k as any, "=", values[k]);
          await del.execute();
          await u.insertInto(t, values).execute();
        }
      }
    });
    return c.json({ ok: true, counts });
  });

  return app;
}

export const watchlistServer: CortexServerModule = { id: "watchlist", migrations, routes };
