import { useState } from "react";
import {
  deleteConnection,
  newId,
  PageFrame,
  proxyFetch,
  saveConnection,
  useConnections,
  useDialog,
  type ApiConnection,
  type ConnectionAuth,
} from "@cortex/core";
import { Badge, Button, Grid, Input, Panel, Segmented } from "@cortex/ui";

/** Presets only prefill the form; every connection has the same generic shape. */
const PRESETS: { key: string; label: string; name: string; baseUrl: string; auth: ConnectionAuth; authKey: string }[] = [
  { key: "custom", label: "Custom", name: "", baseUrl: "", auth: "bearer", authKey: "" },
  { key: "homey", label: "Homey Pro", name: "Homey", baseUrl: "http://homey.local/api/manager", auth: "bearer", authKey: "" },
  // Docker's unix socket isn't reachable over HTTP; run a docker-socket-proxy container and point at it.
  { key: "docker", label: "Docker", name: "Docker", baseUrl: "http://docker-socket-proxy:2375", auth: "none", authKey: "" },
  { key: "tmdb", label: "TMDB", name: "TMDB", baseUrl: "https://api.themoviedb.org/3", auth: "query", authKey: "api_key" },
];

const AUTH_OPTIONS: { value: ConnectionAuth; label: string }[] = [
  { value: "none", label: "None" },
  { value: "bearer", label: "Bearer" },
  { value: "header", label: "Header" },
  { value: "query", label: "Query" },
];

interface Draft {
  id: string;
  name: string;
  baseUrl: string;
  auth: ConnectionAuth;
  authKey: string;
  token: string;
  hasToken: boolean;
  isNew: boolean;
}

const blank = (): Draft => ({ id: newId(), name: "", baseUrl: "", auth: "bearer", authKey: "", token: "", hasToken: false, isNew: true });

/** Settings → Connections: external APIs that dashboard widgets can call through the server. */
export function ConnectionsSettings() {
  const { connections, error, refresh } = useConnections();
  const dialog = useDialog();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, { ok: boolean; text: string }>>({});

  const edit = (c: ApiConnection) =>
    setDraft({ id: c.id, name: c.name, baseUrl: c.baseUrl, auth: c.auth, authKey: c.authKey, token: "", hasToken: c.hasToken, isNew: false });

  const save = async () => {
    if (!draft) return;
    setSaveError(null);
    try {
      await saveConnection({
        id: draft.id,
        name: draft.name,
        baseUrl: draft.baseUrl,
        auth: draft.auth,
        authKey: draft.authKey,
        // An empty field on an existing connection keeps its stored token.
        ...(draft.token || draft.isNew || draft.auth === "none" ? { token: draft.auth === "none" ? "" : draft.token } : {}),
      });
      setDraft(null);
      await refresh();
    } catch (e) {
      setSaveError((e as Error).message);
    }
  };

  const remove = async (c: ApiConnection) => {
    if (!(await dialog.confirm(`Delete the connection "${c.name}"? Widgets using it stop updating.`, { confirmLabel: "Delete", danger: true }))) return;
    await deleteConnection(c.id);
    await refresh();
  };

  const test = async (c: ApiConnection) => {
    setTests((t) => ({ ...t, [c.id]: { ok: true, text: "Testing…" } }));
    try {
      const res = await proxyFetch(c.id, "");
      const body = await res.text();
      let msg = `HTTP ${res.status}`;
      if (!res.ok) {
        try {
          msg = JSON.parse(body).error ?? msg;
        } catch {
          /* not JSON */
        }
      }
      setTests((t) => ({ ...t, [c.id]: { ok: res.ok, text: res.ok ? `Reachable · ${msg}` : msg } }));
    } catch (e) {
      setTests((t) => ({ ...t, [c.id]: { ok: false, text: String((e as Error).message) } }));
    }
  };

  const needsKey = draft && (draft.auth === "header" || draft.auth === "query");

  return (
    <PageFrame
      crumbs={["Settings", "Connections"]}
      title="Connections"
      subtitle="External APIs your widgets can read from. Tokens stay on the server and are encrypted."
      actions={
        <Button variant="secondary" size="sm" icon="plus" onClick={() => setDraft(blank())}>
          Add connection
        </Button>
      }
    >
      <Grid>
        <Panel span={draft ? 7 : 12} label="Connections" meta={`${connections.length}`} flush>
          <ul className="settings-list">
            {connections.length === 0 && (
              <li className="settings-muted">No connections yet. Add one to use API widgets on Home.</li>
            )}
            {connections.map((c) => (
              <li key={c.id}>
                <span className="settings-list__label">
                  {c.name} <span className="settings-muted">{c.baseUrl}</span>
                  {tests[c.id] && <span className={tests[c.id].ok ? "settings-ok conn-test" : "settings-error conn-test"}>{tests[c.id].text}</span>}
                </span>
                <Badge>{AUTH_OPTIONS.find((a) => a.value === c.auth)?.label}</Badge>
                {c.auth !== "none" && !c.hasToken && <Badge tone="negative">No token</Badge>}
                <Button size="sm" variant="ghost" onClick={() => test(c)}>
                  Test
                </Button>
                <Button size="sm" variant="ghost" onClick={() => edit(c)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" icon="x" aria-label={`Delete ${c.name}`} onClick={() => remove(c)} />
              </li>
            ))}
            {error && <li className="settings-error">{error}</li>}
          </ul>
        </Panel>

        {draft && (
          <Panel span={5} label={draft.isNew ? "New connection" : "Edit connection"}>
            <form
              className="settings-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              {draft.isNew && (
                <Segmented
                  size="sm"
                  aria-label="Preset"
                  options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
                  defaultValue="custom"
                  onChange={(k) => {
                    const p = PRESETS.find((x) => x.key === k)!;
                    setDraft({ ...draft, name: p.name || draft.name, baseUrl: p.baseUrl, auth: p.auth, authKey: p.authKey });
                  }}
                />
              )}
              <Input label="Name" required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              <Input
                label="Base URL"
                required
                placeholder="https://api.example.com/v1"
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                hint="Widget paths are added to this."
              />
              <Segmented size="sm" aria-label="Auth" options={AUTH_OPTIONS} value={draft.auth} onChange={(v) => setDraft({ ...draft, auth: v as ConnectionAuth })} />
              {needsKey && (
                <Input
                  label={draft.auth === "header" ? "Header name" : "Query parameter"}
                  required
                  placeholder={draft.auth === "header" ? "X-Api-Key" : "api_key"}
                  value={draft.authKey}
                  onChange={(e) => setDraft({ ...draft, authKey: e.target.value })}
                />
              )}
              {draft.auth !== "none" && (
                <Input
                  label="Token"
                  type="password"
                  autoComplete="off"
                  value={draft.token}
                  onChange={(e) => setDraft({ ...draft, token: e.target.value })}
                  hint={draft.hasToken ? "Leave empty to keep the saved token." : "Stored encrypted on the server."}
                />
              )}
              {saveError && <p className="settings-error">{saveError}</p>}
              <div className="notes-import-actions">
                <Button type="submit" variant="primary">
                  Save
                </Button>
                <Button variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Panel>
        )}
      </Grid>
    </PageFrame>
  );
}
