import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AI_PRESETS, api, PageFrame, useAiStatus, useDialog, type AiConnection, type AiPreset } from "@cortex/core";
import { Badge, Button, Grid, Icon, Input, Panel, Toggle } from "@cortex/ui";
import { authClient } from "../auth";

/*
 * Settings → AI: connect Claude, ChatGPT, Gemini, OpenRouter, Ollama, LM
 * Studio or any OpenAI-compatible server. Keys are write-only: the server
 * stores them encrypted and never sends them back.
 */

interface Draft {
  id: string | null;
  preset: AiPreset;
  name: string;
  baseUrl: string;
  apiKey: string;
  hasKey: boolean;
  model: string;
  shared: boolean;
}

const presetOf = (id: string) => AI_PRESETS.find((p) => p.id === id) ?? AI_PRESETS[AI_PRESETS.length - 1];

export function AiSettings() {
  const qc = useQueryClient();
  const dialog = useDialog();
  const status = useAiStatus();
  const session = authClient.useSession();
  const admin = (session.data?.user as { role?: string } | undefined)?.role === "admin";
  const list = useQuery({ queryKey: ["ai", "connections"], queryFn: () => api<AiConnection[]>("/ai/connections") });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "models" | "test" | "save">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["ai"] });
  const open = (d: Draft) => {
    setDraft(d);
    setModels([]);
    setMsg(null);
  };
  const add = (p: AiPreset) => open({ id: null, preset: p, name: p.label, baseUrl: p.baseUrl, apiKey: "", hasKey: false, model: p.model, shared: false });
  const edit = (c: AiConnection) => open({ id: c.id, preset: presetOf(c.preset), name: c.name, baseUrl: c.baseUrl, apiKey: "", hasKey: c.hasKey, model: c.model, shared: c.shared });
  const settings = (d: Draft) => ({ id: d.id ?? undefined, preset: d.preset.id, baseUrl: d.baseUrl.trim(), apiKey: d.apiKey || undefined, model: d.model.trim() });

  const loadModels = async () => {
    if (!draft) return;
    setBusy("models");
    setMsg(null);
    try {
      const r = await api<{ models: string[] }>("/ai/models", { method: "POST", json: settings(draft) });
      setModels(r.models);
      if (!r.models.length) setMsg({ ok: false, text: "No models found. With Ollama, pull one first (ollama pull llama3.2)." });
      else if (!draft.model) setDraft({ ...draft, model: r.models[0] });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't list models." });
    }
    setBusy("");
  };
  const test = async () => {
    if (!draft) return;
    setBusy("test");
    setMsg(null);
    try {
      const r = await api<{ reply: string; ms: number }>("/ai/test", { method: "POST", json: settings(draft) });
      setMsg({ ok: true, text: `Connected. Replied “${r.reply}” in ${(r.ms / 1000).toFixed(1)} s.` });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Test failed." });
    }
    setBusy("");
  };
  const save = async () => {
    if (!draft) return;
    setBusy("save");
    setMsg(null);
    const body = { name: draft.name.trim(), preset: draft.preset.id, baseUrl: draft.baseUrl.trim(), model: draft.model.trim(), ...(draft.apiKey ? { apiKey: draft.apiKey } : {}), ...(admin ? { shared: draft.shared } : {}) };
    try {
      if (draft.id) await api(`/ai/connections/${draft.id}`, { method: "PATCH", json: body });
      else await api("/ai/connections", { method: "POST", json: body });
      setDraft(null);
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't save." });
    }
    setBusy("");
  };
  const remove = async (c: AiConnection) => {
    if (!(await dialog.confirm(`Remove “${c.name}”? Its key is deleted from this server.`, { confirmLabel: "Remove", danger: true }))) return;
    await api(`/ai/connections/${c.id}`, { method: "DELETE" });
    await refresh();
  };
  const makeDefault = async (c: AiConnection) => {
    await api(`/ai/connections/${c.id}`, { method: "PATCH", json: { isDefault: true } });
    await refresh();
  };

  const own = (list.data ?? []).filter((c) => !c.readOnly);
  const sharedByAdmin = (list.data ?? []).filter((c) => c.readOnly);
  const local = draft && !draft.preset.needsKey;

  return (
    <PageFrame crumbs={["Settings", "AI"]} title="AI" subtitle="Connect the AI you already use. Cortex uses it to write recipes, file payments and rewrite notes.">
      <Grid>
        <Panel span={12} label="In use">
          <div className="ai-status">
            {status.data?.connection ? (
              <>
                <span className="ai-status__dot" aria-hidden />
                <span>
                  <strong>{status.data.connection.name}</strong> · <span className="ai-mono">{status.data.connection.model || "no model chosen"}</span>
                  {status.data.connection.shared && <span className="settings-muted"> · shared by your admin</span>}
                </span>
              </>
            ) : (
              <span className="settings-muted">No AI connected. AI features stay hidden until you add one.</span>
            )}
          </div>
        </Panel>

        {(own.length > 0 || sharedByAdmin.length > 0) && (
          <Panel span={12} label="Connections" flush>
            <ul className="settings-list">
              {[...own, ...sharedByAdmin].map((c) => (
                <li key={c.id}>
                  <Icon name="bolt" size={16} />
                  <span className="settings-list__label ai-conn">
                    {c.name}
                    <span className="settings-muted">
                      {presetOf(c.preset).label} · <span className="ai-mono">{c.model || "no model"}</span>
                    </span>
                  </span>
                  {c.isDefault && !c.readOnly && <Badge tone="accent">Default</Badge>}
                  {c.shared && <Badge>{c.readOnly ? "Shared by admin" : "Shared"}</Badge>}
                  {!c.readOnly && (
                    <span className="ai-actions">
                      {!c.isDefault && (
                        <Button size="sm" variant="ghost" onClick={() => makeDefault(c)}>
                          Make default
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" icon="pencil" aria-label={`Edit ${c.name}`} onClick={() => edit(c)} />
                      <Button size="sm" variant="ghost" icon="trash" aria-label={`Remove ${c.name}`} onClick={() => remove(c)} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {draft ? (
          <Panel span={12} label={draft.id ? `Edit ${draft.name}` : `Connect ${draft.preset.label}`}>
            <form
              className="ai-form"
              onSubmit={(e) => {
                e.preventDefault();
                void save();
              }}
            >
              <div className="ai-form__row">
                <Input label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <Input label="Address" value={draft.baseUrl} placeholder="http://192.168.1.20:11434/v1" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} hint={local ? "Running Cortex in Docker? localhost means the container: use your computer's LAN IP or host.docker.internal." : undefined} />
              </div>
              <div className="ai-form__row">
                <Input
                  label={draft.preset.needsKey ? "API key" : "API key (optional)"}
                  type="password"
                  autoComplete="off"
                  value={draft.apiKey}
                  placeholder={draft.hasKey ? "Saved. Leave blank to keep it" : draft.preset.hint}
                  onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                />
                <div className="ai-model">
                  <Input label="Model" list="ai-models" value={draft.model} placeholder="Load the list or type a model id" onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
                  <datalist id="ai-models">
                    {models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                  <Button size="sm" variant="ghost" type="button" disabled={busy !== ""} onClick={loadModels}>
                    {busy === "models" ? "Loading…" : models.length ? `${models.length} models` : "Load models"}
                  </Button>
                </div>
              </div>
              {draft.preset.keyUrl && (
                <p className="settings-muted ai-small">
                  Get a key at{" "}
                  <a href={draft.preset.keyUrl} target="_blank" rel="noreferrer noopener">
                    {draft.preset.keyUrl.replace(/^https:\/\//, "").split("/")[0]}
                  </a>
                  . Usage is billed by the provider to your account.
                </p>
              )}
              {admin && <Toggle checked={draft.shared} onChange={(v) => setDraft({ ...draft, shared: v })} label="Share with everyone on this server who hasn't connected their own" />}
              {msg && (
                <p className={`ai-msg${msg.ok ? " is-ok" : " is-bad"}`} role="status">
                  {msg.text}
                </p>
              )}
              <div className="ai-form__actions">
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
                  Cancel
                </Button>
                <Button type="button" variant="secondary" disabled={busy !== "" || !draft.model.trim()} onClick={test}>
                  {busy === "test" ? "Testing…" : "Test"}
                </Button>
                <Button type="submit" variant="primary" disabled={busy !== "" || !draft.baseUrl.trim() || !draft.model.trim() || (draft.preset.needsKey && !draft.apiKey && !draft.hasKey)}>
                  {busy === "save" ? "Saving…" : "Save"}
                </Button>
              </div>
            </form>
          </Panel>
        ) : (
          <Panel span={12} label="Add a connection">
            <div className="ai-presets">
              {AI_PRESETS.map((p) => (
                <button key={p.id} type="button" className="ai-preset" onClick={() => add(p)}>
                  <span className="ai-preset__name">{p.label}</span>
                  <span className="ai-preset__hint">{p.hint}</span>
                </button>
              ))}
            </div>
          </Panel>
        )}

        <Panel span={12} tone="sunken" label="Privacy">
          <p className="settings-muted ai-small">
            When you use an AI feature, the text involved (a recipe idea, payee names and your category list, or the note text you selected) is sent to the provider you connected. Self-hosted models (Ollama, LM Studio) keep everything on your own machines. Keys stay encrypted on this server and are never shown again.
          </p>
        </Panel>
      </Grid>
    </PageFrame>
  );
}
