import type { ServerContext } from "@cortex/core/server";

/*
 * Plex Media Server reader for the one-off watch-history import. Talks to
 * the person's own server with their X-Plex-Token through ctx.outbound (the
 * guarded fetch), pages through libraries and returns watched items with
 * whatever external ids Plex knows (tmdb / imdb / tvdb).
 */

export interface PlexSection {
  id: string;
  title: string;
  type: "movie" | "show";
}

export interface PlexIds {
  tmdb?: number;
  imdb?: string;
  tvdb?: number;
}

export interface PlexMovie {
  title: string;
  year: number | null;
  ids: PlexIds;
  viewedAt: string;
  minutes: number;
}

export interface PlexShow {
  key: string;
  title: string;
  ids: PlexIds;
}

export interface PlexEpisode {
  showKey: string;
  season: number;
  episode: number;
  viewedAt: string;
  minutes: number;
}

export class PlexError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const PAGE = 500;

/** Normalises what people paste: adds http:// and :32400 when missing, drops trailing slashes and paths. */
export function plexBase(raw: string): string {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const u = new URL(s);
  if (!u.port && u.protocol === "http:" && !u.hostname.endsWith("plex.direct")) u.port = "32400";
  return `${u.protocol}//${u.host}`;
}

async function get(ctx: ServerContext, base: string, token: string, path: string): Promise<any> {
  let res;
  try {
    res = await ctx.outbound(`${base}${path}`, { accept: "application/json", "x-plex-token": token });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === "EPRIVATE") throw new PlexError("This Cortex blocks private network addresses (PROXY_PRIVATE_NETWORKS=deny), so it can't reach that Plex server.", 400);
    throw new PlexError(`Couldn't reach Plex at ${base}: ${err.message}`);
  }
  if (res.status === 401) throw new PlexError("Plex rejected the token.", 400);
  if (res.status >= 400) throw new PlexError(`Plex answered HTTP ${res.status}.`);
  try {
    return res.json<any>().MediaContainer ?? {};
  } catch {
    throw new PlexError("That address answered, but not like a Plex server.");
  }
}

async function getAll(ctx: ServerContext, base: string, token: string, path: string): Promise<any[]> {
  const out: any[] = [];
  for (let start = 0; ; start += PAGE) {
    const sep = path.includes("?") ? "&" : "?";
    const mc = await get(ctx, base, token, `${path}${sep}X-Plex-Container-Start=${start}&X-Plex-Container-Size=${PAGE}`);
    const items: any[] = mc.Metadata ?? [];
    out.push(...items);
    const total = Number(mc.totalSize ?? mc.size ?? items.length);
    if (items.length < PAGE || out.length >= total) break;
  }
  return out;
}

/** External ids from the new agents' Guid array and the legacy agents' guid string. */
export function parseIds(item: any): PlexIds {
  const ids: PlexIds = {};
  const take = (g: string) => {
    let m = /^tmdb:\/\/(\d+)/.exec(g) ?? /themoviedb:\/\/(\d+)/.exec(g);
    if (m && !ids.tmdb) ids.tmdb = Number(m[1]);
    m = /^imdb:\/\/(tt\d+)/.exec(g) ?? /agents\.imdb:\/\/(tt\d+)/.exec(g);
    if (m && !ids.imdb) ids.imdb = m[1];
    m = /^tvdb:\/\/(\d+)/.exec(g) ?? /thetvdb:\/\/(\d+)/.exec(g);
    if (m && !ids.tvdb) ids.tvdb = Number(m[1]);
  };
  for (const g of (item.Guid ?? []) as { id: string }[]) take(String(g.id));
  if (typeof item.guid === "string") take(item.guid);
  return ids;
}

const viewedAt = (item: any) => new Date((Number(item.lastViewedAt) || Date.now() / 1000) * 1000).toISOString();
const minutes = (item: any) => Math.round((Number(item.duration) || 0) / 60_000);

export async function plexSections(ctx: ServerContext, base: string, token: string): Promise<PlexSection[]> {
  const mc = await get(ctx, base, token, "/library/sections");
  return ((mc.Directory ?? []) as any[]).filter((d) => d.type === "movie" || d.type === "show").map((d) => ({ id: String(d.key), title: String(d.title), type: d.type }));
}

/** Watched movies, shows with watched episodes, and those episodes, for the chosen sections. */
export async function plexWatched(ctx: ServerContext, base: string, token: string, sections: PlexSection[]) {
  const movies: PlexMovie[] = [];
  const shows = new Map<string, PlexShow>();
  const episodes: PlexEpisode[] = [];
  for (const s of sections) {
    if (s.type === "movie") {
      for (const m of await getAll(ctx, base, token, `/library/sections/${s.id}/all?type=1&includeGuids=1`)) {
        if (!(Number(m.viewCount) > 0)) continue;
        movies.push({ title: String(m.title), year: m.year ? Number(m.year) : null, ids: parseIds(m), viewedAt: viewedAt(m), minutes: minutes(m) });
      }
    } else {
      const eps = (await getAll(ctx, base, token, `/library/sections/${s.id}/all?type=4&includeGuids=1`)).filter((e) => Number(e.viewCount) > 0);
      if (!eps.length) continue;
      const watchedShows = new Set(eps.map((e) => String(e.grandparentRatingKey)));
      for (const sh of await getAll(ctx, base, token, `/library/sections/${s.id}/all?type=2&includeGuids=1`)) {
        const key = String(sh.ratingKey);
        if (watchedShows.has(key)) shows.set(key, { key, title: String(sh.title), ids: parseIds(sh) });
      }
      for (const e of eps) {
        if (e.parentIndex === undefined || e.index === undefined) continue;
        episodes.push({ showKey: String(e.grandparentRatingKey), season: Number(e.parentIndex), episode: Number(e.index), viewedAt: viewedAt(e), minutes: minutes(e) });
      }
    }
  }
  return { movies, shows: [...shows.values()], episodes };
}
