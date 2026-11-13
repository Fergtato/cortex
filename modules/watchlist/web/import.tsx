import { useState } from "react";
import { api, useRouter } from "@cortex/core";
import { Badge, Button, Checkbox, Grid, Input, Panel } from "@cortex/ui";
import { useQueryClient } from "@tanstack/react-query";
import { BASE } from "./components";
import { Frame } from "./views";

/*
 * One-off import of watch history from a Plex Media Server. The token is
 * sent with each request and never stored.
 */

interface Section {
  id: string;
  title: string;
  type: "movie" | "show";
}

interface Result {
  movies: { watched: number; added: number };
  shows: { watched: number; added: number };
  episodes: { watched: number; added: number };
  unmatched: string[];
}

export function ImportPage() {
  const { navigate } = useRouter();
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [sections, setSections] = useState<Section[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "check" | "import">(null);
  const [error, setError] = useState<string | null>(null);

  const run = async <T,>(kind: NonNullable<typeof busy>, fn: () => Promise<T>) => {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("connect", async () => {
      const s = await api<Section[]>("/watchlist/import/plex/sections", { method: "POST", json: { url, token } });
      setSections(s);
      setChosen(new Set(s.map((x) => x.id)));
      setPreview(null);
      setDone(null);
    });

  const body = (dryRun: boolean) => ({ url, token, sections: [...chosen], dryRun });
  const check = () =>
    run("check", async () => {
      setDone(null);
      setPreview(await api<Result>("/watchlist/import/plex", { method: "POST", json: body(true) }));
    });
  const doImport = () =>
    run("import", async () => {
      setDone(await api<Result>("/watchlist/import/plex", { method: "POST", json: body(false) }));
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ["watchlist", "lib"] });
    });

  const summary = (r: Result, verb: string) => (
    <ul className="wl-import-sum">
      <li>
        <strong>{r.movies.added}</strong> movies {verb} <span className="wl-muted">of {r.movies.watched} watched</span>
      </li>
      <li>
        <strong>{r.episodes.added}</strong> episodes {verb} across <strong>{r.shows.added}</strong> shows <span className="wl-muted">of {r.episodes.watched} watched</span>
      </li>
    </ul>
  );

  return (
    <Frame crumbs={["Watchlist", "Import"]} title="Import from Plex" subtitle="Brings in the movies and episodes your Plex server has marked as watched. Anything already in your history is skipped.">
      <Grid>
        <Panel span={6} label="1 · Plex server">
          <form
            className="wl-form"
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <Input label="Server address" placeholder="http://192.168.1.20:32400" value={url} onChange={(e) => setUrl(e.target.value)} hint="Port 32400 is added if you leave it out." />
            <Input
              label="Plex token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              hint={
                <>
                  Used for this import only, never stored.{" "}
                  <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" target="_blank" rel="noreferrer">
                    Finding your token
                  </a>
                </>
              }
            />
            <div>
              <Button type="submit" variant={sections ? "secondary" : "primary"} disabled={!url.trim() || !token.trim() || !!busy}>
                {busy === "connect" ? "Connecting…" : sections ? "Reconnect" : "Connect"}
              </Button>
            </div>
          </form>
        </Panel>

        <Panel span={6} label="2 · Libraries" meta={sections ? `${chosen.size} of ${sections.length}` : undefined}>
          {!sections ? (
            <p className="wl-help">Connect to choose which movie and TV libraries to read.</p>
          ) : sections.length === 0 ? (
            <p className="wl-help">That server has no movie or TV libraries.</p>
          ) : (
            <div className="wl-form">
              {sections.map((s) => (
                <Checkbox className="cx-check--select"
                  key={s.id}
                  label={`${s.title} · ${s.type === "movie" ? "Movies" : "TV"}`}
                  checked={chosen.has(s.id)}
                  onChange={(on) => {
                    const n = new Set(chosen);
                    if (on) n.add(s.id);
                    else n.delete(s.id);
                    setChosen(n);
                    setPreview(null);
                  }}
                />
              ))}
              <div>
                <Button variant="secondary" onClick={check} disabled={!chosen.size || !!busy}>
                  {busy === "check" ? "Reading Plex…" : "Check what will be imported"}
                </Button>
              </div>
            </div>
          )}
        </Panel>

        {error && (
          <Panel span={12} label="Couldn't import">
            <p className="wl-help wl-error">{error}</p>
          </Panel>
        )}

        {(preview || done) && (
          <Panel span={12} label={done ? "Imported" : "3 · Ready to import"} meta={done ? <Badge tone="positive">Done</Badge> : undefined}>
            <div className="wl-form">
              {summary((done ?? preview)!, done ? "added" : "to add")}
              {(done ?? preview)!.unmatched.length > 0 && (
                <details className="wl-import-unmatched">
                  <summary>{(done ?? preview)!.unmatched.length} titles couldn't be matched to TMDB and will be skipped</summary>
                  <p className="wl-muted wl-small">{(done ?? preview)!.unmatched.join(" · ")}</p>
                </details>
              )}
              <div className="wl-inline">
                {preview && (
                  <Button variant="primary" onClick={doImport} disabled={!!busy || (preview.movies.added === 0 && preview.episodes.added === 0)}>
                    {busy === "import" ? "Importing… this can take a minute" : "Import"}
                  </Button>
                )}
                {done && (
                  <Button variant="primary" onClick={() => navigate(`${BASE}/library?status=completed`)}>
                    Open library
                  </Button>
                )}
              </div>
            </div>
          </Panel>
        )}
      </Grid>
    </Frame>
  );
}
