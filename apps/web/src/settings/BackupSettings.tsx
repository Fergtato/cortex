import { useRef, useState } from "react";
import {
  buildBackupFile,
  PageFrame,
  parseBackupFile,
  prepareImport,
  scanImages,
  useDialog,
  type CortexModule,
  type SupabaseSource,
} from "@cortex/core";
import { Badge, Button, Grid, Input, Meter, Panel, Segmented } from "@cortex/ui";
import { MODULES } from "../modules";

const BACKUP_MODULES = MODULES.filter((m): m is CortexModule & { backup: NonNullable<CortexModule["backup"]> } => !!m.backup);

interface Pending {
  file: string;
  version: 1 | 2;
  exportedAt?: string;
  /** Data per module id, only for modules present in the file. */
  data: Record<string, unknown>;
  inline: number;
  supabase: string[];
}

type Phase = { kind: "idle" } | { kind: "ready"; p: Pending } | { kind: "working"; done: number; total: number } | { kind: "done"; lines: string[]; failed: number };

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Settings → Backup: one file for every module's data. Imports Cortex v2
 * backups and v0 backups (pages, databases and dashboards), uploading inline
 * images and optionally copying images from v0's Supabase bucket.
 */
export function BackupSettings() {
  // One hook per module, in registry order (MODULES is static).
  const hooks = BACKUP_MODULES.map((m) => ({ m, h: m.backup.useBackup() }));
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [copyImages, setCopyImages] = useState(true);
  const [sb, setSb] = useState<SupabaseSource>({ url: "", anonKey: "", email: "", password: "" });
  const ready = hooks.every(({ h }) => h.ready);

  const exportAll = async () => {
    const entries = await Promise.all(hooks.map(async ({ m, h }) => [m.id, await h.exportData()] as const));
    const file = buildBackupFile(Object.fromEntries(entries));
    download(`cortex-backup-${file.exportedAt.slice(0, 19).replace(/[T:]/g, "-")}.json`, JSON.stringify(file, null, 2));
  };

  const onFile = async (f: File) => {
    setError(null);
    try {
      const parsed = parseBackupFile(await f.text());
      const data: Record<string, unknown> = {};
      for (const { m } of hooks) {
        const d = parsed.version === 1 ? m.backup.fromV0?.(parsed.raw) : parsed.modules?.[m.id];
        if (d !== undefined) data[m.id] = d;
      }
      if (!Object.keys(data).length) throw new Error("The backup has nothing this Cortex can import.");
      const { inline, supabase } = scanImages(data);
      setPhase({ kind: "ready", p: { file: f.name, version: parsed.version, exportedAt: parsed.exportedAt, data, inline, supabase } });
    } catch (e) {
      setPhase({ kind: "idle" });
      setError((e as Error).message);
    }
  };

  const runImport = async () => {
    if (phase.kind !== "ready" || !ready) return;
    const { p } = phase;
    if (mode === "replace") {
      const what = hooks.filter(({ m }) => m.id in p.data).map(({ h }) => h.summary).join(", ");
      if (!(await dialog.confirm(`Replace ${what} with the backup? This can't be undone.`, { confirmLabel: "Replace", danger: true }))) return;
    }
    const useSupabase = p.supabase.length > 0 && copyImages;
    if (useSupabase && (!sb.url || !sb.anonKey || !sb.email || !sb.password)) {
      setError("Fill in all Supabase fields, or untick copying images.");
      return;
    }
    setError(null);
    setPhase({ kind: "working", done: 0, total: 0 });
    try {
      const { data, failed } = await prepareImport(p.data, useSupabase ? sb : null, (done, total) => setPhase({ kind: "working", done, total }));
      const lines: string[] = [];
      for (const { m, h } of hooks) {
        if (!(m.id in data)) continue;
        await h.importData(data[m.id], mode);
        lines.push(`${m.name}: ${m.backup.describe(data[m.id])}`);
      }
      setPhase({ kind: "done", lines, failed: failed.length + (useSupabase ? 0 : p.supabase.length) });
    } catch (e) {
      setError((e as Error).message);
      setPhase({ kind: "idle" });
    }
  };

  return (
    <PageFrame
      crumbs={["Settings", "Backup"]}
      title="Backup"
      subtitle="One file with everything in every app. Import a Cortex v2 backup, or a backup from Cortex v0."
      actions={
        <Button variant="secondary" size="sm" icon="arrow-down" disabled={!ready} onClick={exportAll}>
          Download backup
        </Button>
      }
    >
      <Grid>
        {hooks.map(({ m, h }) => (
          <Panel key={m.id} span={Math.max(3, Math.floor(12 / hooks.length))} label={m.name}>
            <p className="backup-summary">{h.ready ? h.summary : "Loading…"}</p>
          </Panel>
        ))}

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
                <Button variant="secondary" icon="plus" onClick={() => fileRef.current?.click()} disabled={!ready}>
                  Choose backup file
                </Button>
              </div>
            )}

            {phase.kind === "ready" && (
              <>
                <p className="settings-muted">
                  <strong>{phase.p.file}</strong> · Cortex {phase.p.version === 1 ? "v0" : "v2"} backup
                  {phase.p.exportedAt && ` from ${new Date(phase.p.exportedAt).toLocaleString()}`}
                </p>
                <div className="backup-counts">
                  {hooks
                    .filter(({ m }) => m.id in phase.p.data)
                    .map(({ m }) => (
                      <Badge key={m.id}>
                        {m.name}: {m.backup.describe(phase.p.data[m.id])}
                      </Badge>
                    ))}
                  {phase.p.inline > 0 && <Badge tone="info">{phase.p.inline} embedded images</Badge>}
                  {phase.p.supabase.length > 0 && <Badge tone="info">{phase.p.supabase.length} images in Supabase</Badge>}
                </div>

                <Segmented
                  size="sm"
                  aria-label="Import mode"
                  options={[
                    { value: "merge", label: "Add to what I have" },
                    { value: "replace", label: "Replace what I have" },
                  ]}
                  value={mode}
                  onChange={(v) => setMode(v as "merge" | "replace")}
                />
                <p className="settings-muted">
                  {mode === "merge"
                    ? "Items from the backup are added. Items with the same id are overwritten by the backup's copy."
                    : "Everything in the apps listed above is removed and replaced by the backup. Other apps are untouched."}
                </p>

                {phase.p.supabase.length > 0 && (
                  <div className="backup-supabase">
                    <label className="backup-check">
                      <input type="checkbox" checked={copyImages} onChange={(e) => setCopyImages(e.target.checked)} />
                      Copy {phase.p.supabase.length} images from my old Supabase
                    </label>
                    <p className="settings-muted">
                      The backup points at images stored in Cortex v0's Supabase bucket. Sign in to that Supabase once and they're copied
                      here. Your details are used only in this browser and aren't saved.
                    </p>
                    {copyImages && (
                      <div className="backup-grid">
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
                <p className="settings-ok">Imported. {phase.lines.join(" · ")}</p>
                {phase.failed > 0 && <p className="settings-error">{phase.failed} images couldn't be copied and will show as missing.</p>}
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
