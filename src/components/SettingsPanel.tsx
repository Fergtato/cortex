import { useEffect, useState } from "react";
import {
  ACCENTS,
  FONTS,
  THEMES,
  type AccentKey,
  type FontKey,
  type SettingsApi,
  type ThemeKey,
} from "../settings";
import {
  getDataSource,
  setDataSource,
  type DataSourceMode,
} from "../storage/datasource";
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

type TestState = "idle" | "testing" | "ok" | "unauthorized" | "fail";

function DataSourceSection() {
  const initial = getDataSource();
  const [mode, setMode] = useState<DataSourceMode>(initial.mode);
  const [apiUrl, setApiUrl] = useState(initial.apiUrl);
  const [apiToken, setApiToken] = useState(initial.apiToken ?? "");
  const [test, setTest] = useState<TestState>("idle");

  const dirty =
    mode !== initial.mode ||
    apiUrl.trim() !== initial.apiUrl ||
    apiToken.trim() !== (initial.apiToken ?? "");

  async function testConnection() {
    setTest("testing");
    const base = apiUrl.replace(/\/$/, "");
    try {
      const health = await fetch(`${base}/api/health`);
      if (!health.ok) {
        setTest("fail");
        return;
      }
      // Health is open by design; verify the token against a protected route.
      const authed = await fetch(`${base}/api/pages`, {
        headers: apiToken.trim()
          ? { Authorization: `Bearer ${apiToken.trim()}` }
          : {},
      });
      setTest(authed.status === 401 ? "unauthorized" : authed.ok ? "ok" : "fail");
    } catch {
      setTest("fail");
    }
  }

  function apply() {
    setDataSource({ mode, apiUrl: apiUrl.trim(), apiToken: apiToken.trim() });
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
          className={`opt-btn${mode === "api" ? " active" : ""}`}
          onClick={() => setMode("api")}
        >
          API (SQLite)
        </button>
      </div>

      {mode === "api" && (
        <div className="ds-api">
          <label className="ds-field">
            <span className="ds-field-label">api url</span>
            <input
              className="dialog-input"
              value={apiUrl}
              placeholder="http://localhost:3001"
              onChange={(e) => {
                setApiUrl(e.target.value);
                setTest("idle");
              }}
            />
          </label>
          <label className="ds-field">
            <span className="ds-field-label">token</span>
            <input
              className="dialog-input"
              type="password"
              value={apiToken}
              placeholder="(blank if the server has no CORTEX_TOKEN)"
              onChange={(e) => {
                setApiToken(e.target.value);
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
              {test === "unauthorized" && "✗ wrong or missing token"}
              {test === "fail" && "✗ no response"}
            </span>
          </div>
        </div>
      )}

      <div className="ds-apply-row">
        <span className="ds-note">switching reloads the app</span>
        <button className="dialog-btn primary" disabled={!dirty} onClick={apply}>
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
    baseUrl: "unix:///var/run/docker.sock",
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
          external API connections need the API data source (secrets live on
          the server, which also proxies requests past CORS). Switch above,
          then add connections here.
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
              placeholder="https://… or unix:///var/run/docker.sock"
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
