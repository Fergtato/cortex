import { useState } from "react";
import { useDialog, useRouter } from "@cortex/core";
import { BarChart, Button, Grid, Panel, RankedBars, Segmented, Stat } from "@cortex/ui";
import { isAnime, isCaughtUp, STATUS_LABELS, type LibraryEntry, type MediaType, type TrackStatus, type TypeStats } from "../shared/types";
import { BASE, entryToMedia, MediaGrid, Poster, titlePath } from "./components";
import { libApi, useGenreNames, useLibMutation, useLibrary, useStats, useUpcoming } from "./data";
import { Frame, UpcomingCard } from "./views";

const hours = (min: number) => (min >= 600 ? `${Math.round(min / 60)}` : (Math.round(min / 6) / 10).toString());
const monthShort = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" });

function StatsPanel({ s, kind }: { s: TypeStats; kind: MediaType }) {
  const genres = useGenreNames();
  const unit = kind === "movie" ? "movies" : "episodes";
  const current = s.monthly[s.monthly.length - 1]?.month;
  const tiles: [string, { count: number; minutes: number }][] = [
    ["This week", s.week],
    ["6 months", s.sixMonths],
    ["This year", s.year],
    ["All time", s.lifetime],
  ];
  return (
    <>
      {tiles.map(([label, p]) => (
        <Panel key={label} span={3} label={label}>
          <Stat value={hours(p.minutes)} unit="hours" footer={<span>{p.count.toLocaleString()} {unit}</span>} />
        </Panel>
      ))}
      <Panel span={8} label="Hours watched" meta="Last 12 months">
        <BarChart
          label={`Hours of ${kind === "movie" ? "movies" : "TV"} watched per month`}
          bars={s.monthly.map((m) => ({ key: m.month, label: monthShort(m.month), value: m.minutes / 60, highlight: m.month === current }))}
          format={(v) => `${hours(v * 60)} h`}
          formatTick={(v) => `${Math.round(v)}h`}
          height={180}
        />
      </Panel>
      <Panel span={4} label="Top genres">
        <RankedBars rows={s.topGenres.map((g) => ({ id: String(g.id), label: genres.get(g.id) ?? `Genre ${g.id}`, value: g.count }))} format={(v) => `${v}`} emptyText="Watch something to see your genres." />
      </Panel>
    </>
  );
}

export function StatsPage() {
  const { navigate } = useRouter();
  const stats = useStats();
  const [statsKind, setStatsKind] = useState<MediaType>("tv");
  return (
    <Frame
      crumbs={["Watchlist", "Stats"]}
      actions={
        <Segmented
          size="sm"
          aria-label="Stats type"
          options={[
            { value: "tv", label: "TV" },
            { value: "movie", label: "Movies" },
          ]}
          value={statsKind}
          onChange={(v) => setStatsKind(v as MediaType)}
        />
      }
    >
      <Grid>
        {stats.data && <StatsPanel s={stats.data[statsKind]} kind={statsKind} />}
        <Panel span={12} label="Recent activity" flush>
          {stats.data?.recent.length ? (
            <ul className="wl-activity">
              {stats.data.recent.slice(0, 20).map((e) => (
                <li key={e.id}>
                  <button type="button" className="wl-activity__title" onClick={() => navigate(titlePath({ mediaType: e.mediaType, id: e.tmdbId }))}>
                    {e.title}
                  </button>
                  <span className="wl-muted">{e.season !== null ? `S${e.season} E${e.episode}` : "Movie"}</span>
                  <span className="wl-muted wl-small">{new Date(e.watchedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="wl-empty wl-pad">Nothing watched yet.</p>
          )}
        </Panel>
      </Grid>
    </Frame>
  );
}

type Shelf = "movie" | "tv" | "anime";

const time = (s: string | null) => (s ? Date.parse(s) : 0);
const SORTS = {
  updated: { label: "Recently changed", cmp: (a: LibraryEntry, b: LibraryEntry) => time(b.updatedAt) - time(a.updatedAt) },
  added: { label: "Date added", cmp: (a: LibraryEntry, b: LibraryEntry) => time(b.addedAt) - time(a.addedAt) },
  watched: { label: "Last watched", cmp: (a: LibraryEntry, b: LibraryEntry) => time(b.lastWatchedAt) - time(a.lastWatchedAt) },
  title: { label: "Title A–Z", cmp: (a: LibraryEntry, b: LibraryEntry) => a.title.localeCompare(b.title) },
  release: { label: "Release date", cmp: (a: LibraryEntry, b: LibraryEntry) => (b.releaseDate || "").localeCompare(a.releaseDate || "") },
  rating: { label: "Your rating", cmp: (a: LibraryEntry, b: LibraryEntry) => (b.rating ?? -1) - (a.rating ?? -1) },
  runtime: { label: "Shortest first", cmp: (a: LibraryEntry, b: LibraryEntry) => a.runtime * (a.airedEpisodes ?? 1) - b.runtime * (b.airedEpisodes ?? 1) },
} satisfies Record<string, { label: string; cmp: (a: LibraryEntry, b: LibraryEntry) => number }>;
type SortKey = keyof typeof SORTS;

export function LibraryPage() {
  const { search, navigate } = useRouter();
  const dialog = useDialog();
  const lib = useLibrary();
  const upcoming = useUpcoming();
  const params = new URLSearchParams(search);
  const status = (params.get("status") as TrackStatus | null) ?? "watching";
  const shelf = (params.get("type") as Shelf | null) ?? "movie";
  const sort = (params.get("sort") as SortKey | null) ?? "updated";
  const go = (next: { status?: string; type?: string; sort?: string }) => {
    const p = new URLSearchParams({ status: next.status ?? status });
    const t = next.type ?? shelf;
    if (t !== "movie") p.set("type", t);
    const so = next.sort ?? sort;
    if (so !== "updated") p.set("sort", so);
    navigate(`${BASE}/library?${p}`, { replace: true });
  };
  const createList = useLibMutation((name: string) => libApi.createList(name));
  const entries = lib.data?.entries ?? [];
  const onShelf = entries.filter((e) => (shelf === "anime" ? isAnime(e) : e.mediaType === shelf && !isAnime(e)));
  const byKey = new Map(entries.map((e) => [`${e.mediaType}:${e.tmdbId}`, e]));
  const shelfItems = onShelf
    .filter((e) => e.status === status)
    .sort(SORTS[sort]?.cmp ?? SORTS.updated.cmp)
    .map(entryToMedia);
  const subtitle = (m: { mediaType: string; id: number; releaseDate: string }) => {
    const e = byKey.get(`${m.mediaType}:${m.id}`);
    if (!e) return undefined;
    const bits = [m.releaseDate ? m.releaseDate.slice(0, 4) : "TBA"];
    if (isCaughtUp(e)) bits.push("Caught up");
    else if (e.mediaType === "tv" && e.airedEpisodes && e.status !== "watchlist") bits.push(`${e.watchedCount}/${e.airedEpisodes}`);
    if (e.rating) bits.push(`★ ${e.rating}`);
    return bits.join(" · ");
  };
  const counts = (s: TrackStatus) => onShelf.filter((e) => e.status === s).length;

  return (
    <Frame
      crumbs={["Watchlist", "Library"]}
      actions={
        <Button size="sm" variant="ghost" icon="arrow-down" onClick={() => navigate(`${BASE}/import`)}>
          Import from Plex
        </Button>
      }
    >
      <section className="wl-section">
        <header className="wl-row__head">
          <Segmented
            size="sm"
            aria-label="Status"
            options={(["watching", "watchlist", "completed", "dropped"] as TrackStatus[]).filter((s) => s !== "dropped" || counts(s) > 0 || status === "dropped").map((s) => ({ value: s, label: `${STATUS_LABELS[s]} ${counts(s)}` }))}
            value={status}
            onChange={(v) => go({ status: v })}
          />
          <Segmented
            size="sm"
            aria-label="Shelf type"
            options={[
              { value: "movie", label: "Movies" },
              { value: "tv", label: "TV" },
              { value: "anime", label: "Anime" },
            ]}
            value={shelf}
            onChange={(v) => go({ type: v })}
          />
          <label className="wl-sort">
            <span className="cx-label">Sort</span>
            <select className="wl-select" value={sort} onChange={(e) => go({ sort: e.target.value })} aria-label="Sort">
              {(Object.keys(SORTS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORTS[k].label}
                </option>
              ))}
            </select>
          </label>
        </header>
        <MediaGrid items={shelfItems} subtitle={subtitle} empty={`Nothing on your ${STATUS_LABELS[status].toLowerCase()} shelf yet.`} />
      </section>

      <section className="wl-section">
        <header className="wl-row__head">
          <h2 className="cx-label">Your lists</h2>
          <Button
            size="sm"
            variant="ghost"
            icon="plus"
            onClick={async () => {
              const name = await dialog.prompt("New list");
              if (name?.trim()) createList.mutate(name.trim());
            }}
          >
            New list
          </Button>
        </header>
        {lib.data?.lists.length ? (
          <div className="wl-lists">
            {lib.data.lists.map((l) => (
              <button key={l.id} type="button" className="wl-listcard" onClick={() => navigate(`${BASE}/lists/${l.id}`)}>
                <span className="wl-listcard__posters">
                  {l.items.slice(0, 4).map((i) => (
                    <Poster key={`${i.mediaType}:${i.tmdbId}`} path={i.posterPath} title={i.title} size="w185" />
                  ))}
                </span>
                <span className="wl-listcard__name">{l.name}</span>
                <span className="wl-muted wl-small">{l.items.length} titles</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="wl-empty">No lists yet. Use the ⋯ button on any poster to start one.</p>
        )}
      </section>

      {upcoming.data && upcoming.data.length > 0 && (
        <section className="wl-section">
          <header className="wl-row__head">
            <h2 className="cx-label">Upcoming episodes</h2>
          </header>
          <div className="wl-upcoming">
            {upcoming.data.map((u) => (
              <UpcomingCard key={u.tmdbId} item={u} />
            ))}
          </div>
        </section>
      )}
    </Frame>
  );
}

export function ListPage({ id }: { id: string }) {
  const { navigate } = useRouter();
  const dialog = useDialog();
  const lib = useLibrary();
  const list = lib.data?.lists.find((l) => l.id === id);
  const rename = useLibMutation((name: string) => libApi.renameList(id, name));
  const del = useLibMutation(() => libApi.deleteList(id));
  if (!lib.data) return <Frame crumbs={["Watchlist", "Lists"]}>{null}</Frame>;
  if (!list) return <Frame crumbs={["Watchlist", "Lists"]} title="List not found">{null}</Frame>;
  return (
    <Frame
      crumbs={["Watchlist", { label: "Lists", to: "/watchlist/library" }, list.name]}
      title={list.name}
      subtitle={`${list.items.length} titles`}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const name = await dialog.prompt("Rename list", list.name);
              if (name?.trim()) rename.mutate(name.trim());
            }}
          >
            Rename
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (await dialog.confirm(`Delete the list "${list.name}"? The titles stay in your library.`, { confirmLabel: "Delete", danger: true })) {
                del.mutate(undefined, { onSuccess: () => navigate(`${BASE}/library`) });
              }
            }}
          >
            Delete list
          </Button>
        </>
      }
    >
      <MediaGrid items={list.items.map(entryToMedia)} empty="This list is empty. Use the ⋯ button on any poster to add to it." />
    </Frame>
  );
}
