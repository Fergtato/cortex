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
