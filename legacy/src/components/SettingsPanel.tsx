import { useEffect, useRef, useState } from "react";
import {
  ACCENTS,
  FONTS,
  THEMES,
  type AccentKey,
  type FontKey,
  type SettingsApi,
  type ThemeKey,
  sanitizeSettings,
} from "../settings";
import {
  getDataSource,
  setDataSource,
  type DataSourceMode,
} from "../storage/datasource";
import { useAuth } from "./AuthGate";
import { parseBackup, prepareBackupData } from "../lib/restore";
import {
  connectionsAvailable,
  deleteConnection,
  listConnections,
  proxyFetch,
  saveConnection,
  type ApiConnection,
  type ConnectionAuth,
} from "../lib/connections";
import { invalidateConnectionsCache } from "./dashboard/widgets/apiShared";
import { useDialog } from "./Dialog";
import { useStoreContext } from "../context";
import { buildBackup, downloadBackup } from "../lib/backup";

export function SettingsPanel({
  settings,
  update,
  reset,
  onClose,
}: SettingsApi & { onClose: () => void }) {
  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const accentKeys = Object.keys(ACCENTS) as AccentKey[];
  const themeKeys = Object.keys(THEMES) as ThemeKey[];
  const fontKeys = Object.keys(FONTS) as FontKey[];

  return (
    <div className="dialog-overlay" onMouseDown={onClose}>
      <div className="settings-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialog-bar settings-bar">
          <span>⚙ settings</span>
          <button className="settings-close" title="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <div className="set-label">accent color</div>
            <div className="swatch-row">
              {accentKeys.map((key) => (
                <button
                  key={key}
                  className={`swatch${settings.accent === key ? " active" : ""}`}
                  title={ACCENTS[key].label}
                  style={{ background: ACCENTS[key].accent }}
                  onClick={() => update({ accent: key })}
                />
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="set-label">theme</div>
            <div className="opt-row">
              {themeKeys.map((key) => (
                <button
                  key={key}
                  className={`opt-btn${settings.theme === key ? " active" : ""}`}
                  onClick={() => update({ theme: key })}
                >
                  <span
                    className="theme-chip"
                    style={{
                      background: THEMES[key].bg,
                      borderColor: THEMES[key].lineBright,
                    }}
                  />
                  {THEMES[key].label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="set-label">font</div>
            <div className="opt-row">
              {fontKeys.map((key) => (
                <button
                  key={key}
                  className={`opt-btn${settings.font === key ? " active" : ""}`}
                  style={{ fontFamily: FONTS[key].stack }}
                  onClick={() => update({ font: key })}
                >
                  {FONTS[key].label}
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <div className="set-label">crt glow</div>
            <div className="opt-row">
              <button
                className={`opt-btn${settings.glow ? " active" : ""}`}
                onClick={() => update({ glow: true })}
              >
                on
              </button>
              <button
                className={`opt-btn${!settings.glow ? " active" : ""}`}
                onClick={() => update({ glow: false })}
              >
                off
              </button>
            </div>
          </section>

          <AccountSection />
          <BackupSection settings={settings} update={update} />
          <DataSourceSection />
          <ConnectionsSection />
        </div>

        <div className="settings-foot">
          <button className="dialog-btn" onClick={reset}>
            [ reset to defaults ]
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountSection() {
  const auth = useAuth();
  if (!auth) return null;
  return (
    <section className="settings-section">
      <div className="set-label">account</div>
      <div className="ds-apply-row">
        <span className="ds-note">signed in as {auth.email ?? "(no email)"}</span>
        <button className="dialog-btn" onClick={() => auth.signOut()}>
          [ sign out ]
        </button>
      </div>
    </section>
  );
}

function BackupSection({
  settings,
  update,
}: {
  settings: SettingsApi["settings"];
  update: SettingsApi["update"];
}) {
  const store = useStoreContext();
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pageCount = Object.keys(store.pages).length;

  async function importFile(file: File) {
    setStatus(null);
    try {
      const backup = parseBackup(await file.text());
      const counts = `${Object.keys(backup.pages).length} pages, ${
        Object.keys(backup.databases).length
      } databases/folders, ${Object.keys(backup.dashboards).length} dashboards/folders`;
      const ok = await dialog.confirm(
        `Replace this workspace with the backup from ${backup.exportedAt.slice(0, 10)} (${counts})? Everything currently here will be overwritten.`,
        { confirmLabel: "replace", danger: true }
      );
      if (!ok) return;
      setBusy(true);
      const data = await prepareBackupData(backup, (done, total) =>
        setStatus(total ? `uploading images ${done}/${total}…` : null)
      );
      store.replaceAll(data);
      if (backup.settings) update(sanitizeSettings(backup.settings));
      setStatus("✓ backup imported");
    } catch (err) {
      setStatus(`✗ ${String((err as Error)?.message ?? err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-section">
      <div className="set-label">backup</div>
      <div className="ds-apply-row">
        <span className="ds-note">
          everything ({pageCount} pages · {store.databases.length} databases ·{" "}
          {store.dashboards.length} dashboards + settings) as one .json file
        </span>
        <button
          className="dialog-btn primary"
          disabled={!store.loaded}
          onClick={() => downloadBackup(buildBackup(store.snapshot(), settings))}
        >
          [ export backup ]
        </button>
      </div>
      <div className="ds-apply-row">
        <span className="ds-note">{status ?? "replace this workspace from a backup file"}</span>
        <button
          className="dialog-btn"
          disabled={!store.loaded || busy}
          onClick={() => fileRef.current?.click()}
        >
          [ import backup ]
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) importFile(file);
          }}
        />
      </div>
    </section>
  );
}

type TestState = "idle" | "testing" | "ok" | "unauthorized" | "fail";

function DataSourceSection() {
  const initial = getDataSource();
  const [mode, setMode] = useState<DataSourceMode>(initial.mode);
  const [supabaseUrl, setSupabaseUrl] = useState(initial.supabaseUrl);
  const [anonKey, setAnonKey] = useState(initial.anonKey);
  const [test, setTest] = useState<TestState>("idle");

  const complete = mode === "local" || (supabaseUrl.trim() !== "" && anonKey.trim() !== "");
  const dirty =
    mode !== initial.mode ||
    supabaseUrl.trim() !== initial.supabaseUrl ||
    anonKey.trim() !== initial.anonKey;

  async function testConnection() {
    setTest("testing");
    const base = supabaseUrl.trim().replace(/\/+$/, "");
    try {
      const res = await fetch(`${base}/auth/v1/health`, {
        headers: { apikey: anonKey.trim() },
      });
      setTest(res.status === 401 || res.status === 403 ? "unauthorized" : res.ok ? "ok" : "fail");
    } catch {
      setTest("fail");
    }
  }

  function apply() {
    setDataSource({ mode, supabaseUrl: supabaseUrl.trim(), anonKey: anonKey.trim() });
    // Reload so the store re-initializes against the new backend cleanly.
    window.location.reload();
  }

  return (
    <section className="settings-section">
      <div className="set-label">data source</div>
      <div className="opt-row">
        <button
          className={`opt-btn${mode === "local" ? " active" : ""}`}
          onClick={() => setMode("local")}
        >
          localStorage
        </button>
        <button
          className={`opt-btn${mode === "supabase" ? " active" : ""}`}
          onClick={() => setMode("supabase")}
        >
          Supabase
        </button>
      </div>

      {mode === "supabase" && (
        <div className="ds-api">
          <label className="ds-field">
            <span className="ds-field-label">supabase url</span>
            <input
              className="dialog-input"
              value={supabaseUrl}
              placeholder="https://supabase.example.com"
              onChange={(e) => {
                setSupabaseUrl(e.target.value);
                setTest("idle");
              }}
            />
          </label>
          <label className="ds-field">
            <span className="ds-field-label">anon key</span>
            <input
              className="dialog-input"
              type="password"
              value={anonKey}
              placeholder="the public anon key — never the service-role key"
              onChange={(e) => {
                setAnonKey(e.target.value);
                setTest("idle");
              }}
            />
          </label>
          <div className="ds-test-row">
            <button className="opt-btn" onClick={testConnection}>
              test connection
            </button>
            <span className={`ds-test ds-test-${test}`}>
              {test === "testing" && "…checking"}
              {test === "ok" && "✓ connected"}
              {test === "unauthorized" && "✗ anon key rejected"}
              {test === "fail" && "✗ no response"}
            </span>
          </div>
        </div>
      )}

      <div className="ds-apply-row">
        <span className="ds-note">
          switching reloads the app{mode === "supabase" ? " — you'll be asked to sign in" : ""}
        </span>
        <button className="dialog-btn primary" disabled={!dirty || !complete} onClick={apply}>
          [ apply ]
        </button>
      </div>
    </section>
  );
}

/* ------------------------- API connections ------------------------- */

/** Presets only prefill the form — every source is the same generic shape. */
const CONNECTION_PRESETS: {
  key: string;
  label: string;
  baseUrl: string;
  auth: ConnectionAuth;
  authKey: string;
}[] = [
  { key: "custom", label: "custom", baseUrl: "", auth: "bearer", authKey: "" },
  {
    key: "homey",
    label: "Homey Pro",
    baseUrl: "http://homey.local/api/manager",
    auth: "bearer",
    authKey: "",
  },
  {
    key: "docker",
    label: "Docker",
    // Docker's unix socket isn't reachable from an Edge Function — expose it
    // over HTTP (e.g. a docker-socket-proxy container) and point at that.
    baseUrl: "http://docker-socket-proxy:2375",
    auth: "none",
    authKey: "",
  },
  {
    key: "tmdb",
    label: "TMDB",
    baseUrl: "https://api.themoviedb.org/3",
    auth: "query",
    authKey: "api_key",
  },
];

const AUTH_LABELS: Record<ConnectionAuth, string> = {
  none: "none",
  bearer: "bearer token",
  header: "custom header",
  query: "query param",
};

function connUid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface ConnDraft {
  id: string;
  name: string;
  baseUrl: string;
  auth: ConnectionAuth;
  authKey: string;
  token: string;
  /** Editing an existing connection that already holds a token. */
  hasToken: boolean;
}

function ConnectionsSection() {
  const dialog = useDialog();
  const available = connectionsAvailable();
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConnDraft | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  async function refresh() {
    try {
      setConnections(await listConnections());
      setError(null);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
    invalidateConnectionsCache();
  }

  useEffect(() => {
    if (available) refresh();
  }, [available]);

  if (!available) {
    return (
      <section className="settings-section">
        <div className="set-label">api connections</div>
        <p className="conn-hint">
          external API connections need the Supabase data source (secrets
          live in Supabase and an Edge Function proxies requests past CORS).
          Switch above, then add connections here.
        </p>
      </section>
    );
  }

  function startAdd(presetKey: string) {
    const preset = CONNECTION_PRESETS.find((p) => p.key === presetKey)!;
    setDraft({
      id: connUid(),
      name: preset.key === "custom" ? "" : preset.label,
      baseUrl: preset.baseUrl,
      auth: preset.auth,
      authKey: preset.authKey,
      token: "",
      hasToken: false,
    });
  }

  function startEdit(conn: ApiConnection) {
    setDraft({ ...conn, token: "", hasToken: conn.hasToken });
  }

  async function commitDraft() {
    if (!draft || !draft.name.trim() || !draft.baseUrl.trim()) return;
    await saveConnection({
      id: draft.id,
      name: draft.name.trim(),
      baseUrl: draft.baseUrl.trim(),
      auth: draft.auth,
      authKey: draft.authKey.trim(),
      // Keep the stored secret unless a new one was typed.
      ...(draft.token || !draft.hasToken ? { token: draft.token } : {}),
    });
    setDraft(null);
    await refresh();
  }

  async function remove(conn: ApiConnection) {
    const ok = await dialog.confirm(`Delete connection "${conn.name}"?`, {
      confirmLabel: "delete",
      danger: true,
    });
    if (!ok) return;
    await deleteConnection(conn.id);
    await refresh();
  }

  async function test(conn: ApiConnection) {
    setTestResult((t) => ({ ...t, [conn.id]: "…" }));
    try {
      const res = await proxyFetch(conn.id, "");
      setTestResult((t) => ({
        ...t,
        [conn.id]: `HTTP ${res.status} — ${res.ok ? "reachable" : "reachable (check path/auth)"}`,
      }));
    } catch {
      setTestResult((t) => ({ ...t, [conn.id]: "✗ no response" }));
    }
  }

  return (
    <section className="settings-section">
      <div className="set-label">api connections</div>
      {error && <p className="conn-hint">couldn't reach the server: {error}</p>}

      {connections.map((conn) => (
        <div key={conn.id} className="conn-row">
          <div className="conn-row-main">
            <span className="conn-name">{conn.name}</span>
            <span className="conn-url">{conn.baseUrl}</span>
            <span className="conn-auth">
              {AUTH_LABELS[conn.auth]}
              {conn.hasToken ? " ·•••" : ""}
            </span>
          </div>
          <div className="conn-row-actions">
            <button className="meta-btn" onClick={() => test(conn)}>
              test
            </button>
            <button className="meta-btn" onClick={() => startEdit(conn)}>
              edit
            </button>
            <button className="meta-btn dw-config-danger" onClick={() => remove(conn)}>
              ×
            </button>
          </div>
          {testResult[conn.id] && (
            <div className="conn-test-result">{testResult[conn.id]}</div>
          )}
        </div>
      ))}
      {connections.length === 0 && !error && (
        <p className="conn-hint">no connections yet</p>
      )}

      {!draft && (
        <div className="conn-add-row">
          <span className="conn-hint">add:</span>
          {CONNECTION_PRESETS.map((p) => (
            <button key={p.key} className="opt-btn" onClick={() => startAdd(p.key)}>
              + {p.label}
            </button>
          ))}
        </div>
      )}

      {draft && (
        <div className="conn-form">
          <label className="ds-field">
            <span className="ds-field-label">name</span>
            <input
              className="dialog-input"
              value={draft.name}
              placeholder="e.g. My Homey"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="ds-field">
            <span className="ds-field-label">base url</span>
            <input
              className="dialog-input"
              value={draft.baseUrl}
              placeholder="https://…"
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
          </label>
          <div className="ds-field">
            <span className="ds-field-label">auth</span>
            <div className="opt-row">
              {(Object.keys(AUTH_LABELS) as ConnectionAuth[]).map((a) => (
                <button
                  key={a}
                  className={`opt-btn${draft.auth === a ? " active" : ""}`}
                  onClick={() => setDraft({ ...draft, auth: a })}
                >
                  {AUTH_LABELS[a]}
                </button>
              ))}
            </div>
          </div>
          {(draft.auth === "header" || draft.auth === "query") && (
            <label className="ds-field">
              <span className="ds-field-label">
                {draft.auth === "header" ? "header name" : "param name"}
              </span>
              <input
                className="dialog-input"
                value={draft.authKey}
                placeholder={draft.auth === "header" ? "X-Api-Key" : "api_key"}
                onChange={(e) => setDraft({ ...draft, authKey: e.target.value })}
              />
            </label>
          )}
          {draft.auth !== "none" && (
            <label className="ds-field">
              <span className="ds-field-label">token</span>
              <input
                className="dialog-input"
                type="password"
                value={draft.token}
                placeholder={draft.hasToken ? "(unchanged)" : "secret token"}
                onChange={(e) => setDraft({ ...draft, token: e.target.value })}
              />
            </label>
          )}
          <div className="ds-apply-row">
            <button className="dialog-btn" onClick={() => setDraft(null)}>
              cancel
            </button>
            <button
              className="dialog-btn primary"
              disabled={!draft.name.trim() || !draft.baseUrl.trim()}
              onClick={commitDraft}
            >
              [ save connection ]
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
