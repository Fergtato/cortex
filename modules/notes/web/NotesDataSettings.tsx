import { useRef, useState } from "react";
import { PageFrame, useDialog } from "@cortex/core";
import { Badge, Button, Grid, Input, Meter, Panel, Segmented, Stat } from "@cortex/ui";
import "./notes.css";
import { useStoreContext } from "./context";
import { isDatabase } from "./types";
import { downloadBackup, parseBackup, prepareImport, scanImages, type ParsedBackup, type SupabaseSource } from "./lib/backup";

type Phase =
  | { kind: "idle" }
  | { kind: "ready"; file: string; backup: ParsedBackup; inline: number; supabase: string[] }
  | { kind: "working"; done: number; total: number }
  | { kind: "done"; pages: number; databases: number; failed: number };

/** Settings → Notes data: download a backup, or import one (including Cortex v0 backups). */
export function NotesDataSettings() {
  const store = useStoreContext();
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [copyImages, setCopyImages] = useState(true);
  const [sb, setSb] = useState<SupabaseSource>({ url: "", anonKey: "", email: "", password: "" });

  const pageCount = Object.keys(store.pages).length;
  const dbCount = store.databases.length;

  const onFile = async (f: File) => {
    setError(null);
    try {
      const backup = parseBackup(await f.text());
      const { inline, supabase } = scanImages(backup.data);
      setPhase({ kind: "ready", file: f.name, backup, inline, supabase });
    } catch (e) {
      setPhase({ kind: "idle" });
      setError((e as Error).message);
    }
  };

  const runImport = async () => {
    if (phase.kind !== "ready" || !store.loaded) return;
    const { backup, supabase } = phase;
    if (mode === "replace") {
      const ok = await dialog.confirm(
        `Replace all ${pageCount} pages and ${dbCount} databases with the backup? This can't be undone.`,
        { confirmLabel: "Replace", danger: true },
      );
      if (!ok) return;
    }
    const useSupabase = supabase.length > 0 && copyImages;
    if (useSupabase && (!sb.url || !sb.anonKey || !sb.email || !sb.password)) {
      setError("Fill in all Supabase fields, or untick copying images.");
      return;
    }
    setError(null);
    setPhase({ kind: "working", done: 0, total: 0 });
    try {
      const { data, failed } = await prepareImport(backup.data, useSupabase ? sb : null, (done, total) =>
        setPhase({ kind: "working", done, total }),
      );
      const current = store.snapshot();
      store.replaceAll(
        mode === "replace"
          ? data
          : { pages: { ...current.pages, ...data.pages }, databases: { ...current.databases, ...data.databases } },
      );
      setPhase({
        kind: "done",
        pages: Object.keys(data.pages).length,
        databases: Object.values(data.databases).filter(isDatabase).length,
        failed: failed.length + (useSupabase ? 0 : supabase.length),
      });
    } catch (e) {
      setError((e as Error).message);
      setPhase({ kind: "idle" });
    }
  };

  return (
    <PageFrame crumbs={["Settings", "Notes data"]} title="Notes data" subtitle="Back up your pages and databases, or bring in a backup from Cortex v0.">
      <Grid>
        <Panel span={4} label="Pages">
          <Stat value={pageCount.toLocaleString()} size="sm" />
        </Panel>
        <Panel span={4} label="Databases">
          <Stat value={dbCount.toLocaleString()} size="sm" />
        </Panel>
        <Panel span={4} label="Backup">
          <Button variant="secondary" icon="arrow-down" disabled={!store.loaded} onClick={() => downloadBackup(store.snapshot())}>
            Download backup
          </Button>
        </Panel>

        <Panel span={12} label="Import a backup" meta="JSON from Cortex v0 or v2">
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void onFile(f);
            }}
          />
          <div className="settings-stack">
            {phase.kind === "idle" && (
              <div>
                <Button variant="secondary" icon="plus" onClick={() => fileRef.current?.click()} disabled={!store.loaded}>
                  Choose backup file
                </Button>
              </div>
            )}

            {phase.kind === "ready" && (
              <>
                <p className="settings-muted">
                  <strong>{phase.file}</strong> · Cortex {phase.backup.version === 1 ? "v0" : "v2"} backup
                  {phase.backup.exportedAt && ` from ${new Date(phase.backup.exportedAt).toLocaleString()}`}
                </p>
                <div className="notes-import-counts">
                  <Badge>{Object.keys(phase.backup.data.pages).length} pages</Badge>
                  <Badge>{Object.values(phase.backup.data.databases).filter(isDatabase).length} databases</Badge>
                  {phase.inline > 0 && <Badge tone="info">{phase.inline} embedded images</Badge>}
                  {phase.supabase.length > 0 && <Badge tone="info">{phase.supabase.length} images in Supabase</Badge>}
                  {phase.backup.dashboardCount > 0 && <Badge>{phase.backup.dashboardCount} dashboards (imported with Home, later)</Badge>}
                </div>

                <Segmented
                  size="sm"
                  aria-label="Import mode"
                  options={[
                    { value: "merge", label: "Add to my notes" },
                    { value: "replace", label: "Replace my notes" },
                  ]}
                  value={mode}
                  onChange={(v) => setMode(v as "merge" | "replace")}
                />
                <p className="settings-muted">
                  {mode === "merge"
                    ? "Pages and databases from the backup are added. Items with the same id are overwritten by the backup's copy."
                    : "Everything currently in Notes is removed and replaced by the backup."}
                </p>

                {phase.supabase.length > 0 && (
                  <div className="notes-import-supabase">
                    <label className="notes-import-check">
                      <input type="checkbox" checked={copyImages} onChange={(e) => setCopyImages(e.target.checked)} />
                      Copy {phase.supabase.length} images from my old Supabase
                    </label>
                    <p className="settings-muted">
                      The backup points at images stored in Cortex v0's Supabase bucket. Sign in to that Supabase once and they're
                      copied here. Your details are used only in this browser and aren't saved.
                    </p>
                    {copyImages && (
                      <div className="notes-import-grid">
                        <Input label="Supabase URL" placeholder="http://192.168.1.10:8000" value={sb.url} onChange={(e) => setSb({ ...sb, url: e.target.value.trim() })} />
                        <Input label="Anon key" value={sb.anonKey} onChange={(e) => setSb({ ...sb, anonKey: e.target.value.trim() })} />
                        <Input label="Email" type="email" autoComplete="off" value={sb.email} onChange={(e) => setSb({ ...sb, email: e.target.value.trim() })} />
                        <Input label="Password" type="password" autoComplete="off" value={sb.password} onChange={(e) => setSb({ ...sb, password: e.target.value })} />
                      </div>
                    )}
                  </div>
                )}

                <div className="notes-import-actions">
                  <Button variant={mode === "replace" ? "danger" : "primary"} onClick={runImport}>
                    {mode === "replace" ? "Replace and import" : "Import"}
                  </Button>
                  <Button variant="ghost" onClick={() => setPhase({ kind: "idle" })}>
                    Cancel
                  </Button>
                </div>
              </>
            )}

            {phase.kind === "working" && (
              <Meter
                value={phase.done}
                max={Math.max(1, phase.total)}
                tone="accent"
                label={phase.total ? "Copying images" : "Importing"}
                valueLabel={phase.total ? `${phase.done} / ${phase.total}` : undefined}
              />
            )}

            {phase.kind === "done" && (
              <>
                <p className="settings-ok">
                  Imported {phase.pages} pages and {phase.databases} databases.
                </p>
                {phase.failed > 0 && (
                  <p className="settings-error">
                    {phase.failed} images couldn't be copied and will show as missing.
                  </p>
                )}
                <div>
                  <Button variant="secondary" onClick={() => setPhase({ kind: "idle" })}>
                    Import another
                  </Button>
                </div>
              </>
            )}

            {error && <p className="settings-error">{error}</p>}
          </div>
        </Panel>
      </Grid>
    </PageFrame>
  );
}
