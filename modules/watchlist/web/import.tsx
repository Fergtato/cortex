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

interface PlexServer {
  id: string;
  name: string;
  owned: boolean;
  owner: string | null;
  accessToken: string;
  urls: string[];
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
  // Manual form (own server)…
  const [manualUrl, setManualUrl] = useState("");
  const [manualToken, setManualToken] = useState("");
  // …or a Plex account: its servers, and the one being read.
  const [account, setAccount] = useState<string | null>(null);
  const [servers, setServers] = useState<PlexServer[] | null>(null);
  const [server, setServer] = useState<PlexServer | null>(null);
  const [waiting, setWaiting] = useState(false);
  // What the import uses: the resolved address and token of the chosen server.
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

  const open = (r: { url: string; sections: Section[] }, t: string) => {
    setUrl(r.url);
    setToken(t);
    setSections(r.sections);
    setChosen(new Set(r.sections.map((x) => x.id)));
    setPreview(null);
    setDone(null);
  };
  const connect = () =>
    run("connect", async () => {
      setServer(null);
      open(await api<{ url: string; sections: Section[] }>("/watchlist/import/plex/sections", { method: "POST", json: { url: manualUrl, token: manualToken } }), manualToken);
    });
  const pickServer = (s: PlexServer) =>
    run("connect", async () => {
      setServer(s);
      setSections(null);
      open(await api<{ url: string; sections: Section[] }>("/watchlist/import/plex/sections", { method: "POST", json: { urls: s.urls, token: s.accessToken } }), s.accessToken);
    });

  /** Plex's PIN sign-in: approve on plex.tv in a new tab while we wait for the token. */
  const signIn = async () => {
    setError(null);
    const tab = window.open("about:blank", "_blank");
    try {
      const pin = await api<{ id: number; authUrl: string }>("/watchlist/import/plex/pin", { method: "POST", json: {} });
      if (tab) tab.location.href = pin.authUrl;
      else window.location.assign(pin.authUrl);
      setWaiting(true);
      const started = Date.now();
      let t: string | null = null;
      while (!t && Date.now() - started < 5 * 60_000) {
        await new Promise((r) => setTimeout(r, 2000));
        t = (await api<{ token: string | null }>(`/watchlist/import/plex/pin/${pin.id}`)).token;
      }
      if (!t) throw new Error("Plex sign-in timed out. Try again.");
      try {
        tab?.close();
      } catch {
        /* the tab may have navigated away */
      }
      setAccount(t);
      setServers(await api<PlexServer[]>("/watchlist/import/plex/servers", { method: "POST", json: { token: t } }));
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
    } finally {
      setWaiting(false);
    }
  };

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
    <Frame crumbs={["Watchlist", "Import"]} title="Import from Plex" subtitle="Brings in the movies and episodes Plex has marked as watched for you. Anything already in your history is skipped. Your Plex sign-in is used for this import only and never stored.">
      <Grid>
        <Panel span={6} label="1 · Plex">
          <div className="wl-form">
            {!account ? (
              <>
                <p className="wl-help">Sign in with your Plex account to read any server you can watch on: your own, or one a friend shares with you.</p>
                <div>
                  <Button variant="primary" onClick={signIn} disabled={waiting}>
                    {waiting ? "Waiting for Plex…" : "Sign in with Plex"}
                  </Button>
                </div>
                {waiting && <p className="wl-muted wl-small">Approve Cortex in the Plex tab that opened, then come back here.</p>}
              </>
            ) : (
              <>
                <span className="cx-label">Servers</span>
                {servers && !servers.length && <p className="wl-help">This account can't see any servers.</p>}
                <div className="wl-servers">
                  {servers?.map((sv) => (
                    <button key={sv.id} type="button" className={`wl-server${server?.id === sv.id ? " is-on" : ""}`} onClick={() => pickServer(sv)} disabled={!!busy}>
                      <span className="wl-server__name">{sv.name}</span>
                      <span className="wl-muted wl-small">{sv.owned ? "Your server" : `Shared by ${sv.owner ?? "a friend"}`}</span>
                    </button>
                  ))}
                </div>
                {busy === "connect" && <p className="wl-muted wl-small">Connecting…</p>}
                <div>
                  <Button size="sm" variant="ghost" onClick={() => (setAccount(null), setServers(null), setServer(null), setSections(null))}>
                    Sign out of Plex
                  </Button>
                </div>
              </>
            )}
            <details className="wl-advanced">
              <summary>Use a server address and token instead</summary>
              <form
                className="wl-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void connect();
                }}
              >
                <Input label="Server address" placeholder="http://192.168.1.20:32400" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} hint="Port 32400 is added if you leave it out." />
                <Input
                  label="Plex token"
                  type="password"
                  autoComplete="off"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
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
                  <Button type="submit" variant="secondary" disabled={!manualUrl.trim() || !manualToken.trim() || !!busy}>
                    {busy === "connect" && !server ? "Connecting…" : "Connect"}
                  </Button>
                </div>
              </form>
            </details>
          </div>
        </Panel>

        <Panel span={6} label="2 · Libraries" meta={sections ? `${chosen.size} of ${sections.length}` : undefined}>
          {!sections ? (
            <p className="wl-help">Pick a server to choose which movie and TV libraries to read.</p>
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
