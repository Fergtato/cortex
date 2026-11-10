import { useMemo, useRef, useState, type ReactNode } from "react";
import { newId, PageFrame, useDialog, useSettings, type UserSettings } from "@cortex/core";
import {
  ACCENT_PRESETS,
  Badge,
  BUILTIN_THEMES,
  Button,
  checkContrast,
  cx,
  DENSITIES,
  FONTS,
  Grid,
  ICON_STYLES,
  Input,
  Meter,
  Panel,
  parseTheme,
  resolveTheme,
  Segmented,
  SHAPES,
  Stat,
  ThemeScope,
  themeColors,
  type Theme,
} from "@cortex/ui";
import { availableThemes } from "../ThemeApplier";

type Prefs = UserSettings["theme"];
const DEFAULT = "__theme";

/** Offers the file to the viewer as a download (works on plain-http LAN installs too). */
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AppearanceSettings() {
  const { settings, update } = useSettings();
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadErrors, setUploadErrors] = useState<string[] | null>(null);
  const prefs = settings.theme;
  const themes = useMemo(() => availableThemes(settings), [settings]);
  const current = themes[prefs.themeId] ?? BUILTIN_THEMES.dark;
  const resolved = useMemo(() => resolveTheme(current, prefs), [current, prefs]);
  const issues = useMemo(() => checkContrast(resolved.vars), [resolved]);

  const setPrefs = (patch: Partial<Prefs>) => update({ theme: { ...prefs, ...patch } });
  /** Segmented value for an optional override: unset shows as "Theme". */
  const choose = <K extends "shape" | "font" | "icons" | "density">(key: K) => ({
    value: prefs[key] ?? DEFAULT,
    onChange: (v: string) => setPrefs({ [key]: v === DEFAULT ? undefined : v } as Partial<Prefs>),
  });

  const onUpload = async (file: File) => {
    const r = parseTheme(await file.text());
    if (!r.ok) {
      setUploadErrors(r.errors);
      return;
    }
    setUploadErrors(null);
    const id = `custom-${newId()}`;
    update({ customThemes: { ...settings.customThemes, [id]: r.theme }, theme: { ...prefs, themeId: id } });
  };

  const removeTheme = async (id: string, name: string) => {
    if (!(await dialog.confirm(`Remove the theme "${name}"?`, { confirmLabel: "Remove", danger: true }))) return;
    const { [id]: _gone, ...rest } = settings.customThemes;
    update({ customThemes: rest, theme: prefs.themeId === id ? { ...prefs, themeId: "dark" } : prefs });
  };

  const exportCurrent = () => {
    const file: Theme = { ...current, colors: themeColors(current) };
    download(`${current.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.cortex-theme.json`, JSON.stringify(file, null, 2));
  };

  const accentValue = prefs.accent
    ? (Object.entries(ACCENT_PRESETS).find(([, v]) => v === prefs.accent)?.[0] ?? "custom")
    : DEFAULT;

  return (
    <PageFrame
      crumbs={["Settings", "Appearance"]}
      title="Appearance"
      subtitle="Pick a theme, or upload a theme file. Overrides below apply on top of any theme."
      actions={
        <>
          <Button variant="ghost" size="sm" icon="arrow-down" onClick={exportCurrent}>
            Download current
          </Button>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => fileRef.current?.click()}>
            Upload theme
          </Button>
        </>
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onUpload(f);
        }}
      />
      <Grid>
        {uploadErrors && (
          <Panel span={12} label="Theme file not loaded" tone="sunken" action={<Button size="sm" variant="ghost" icon="x" aria-label="Dismiss" onClick={() => setUploadErrors(null)} />}>
            <ul className="settings-errors">
              {uploadErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel span={12} label="Theme" meta={`${Object.keys(themes).length} available`}>
          <div className="theme-cards">
            {Object.entries(themes).map(([id, t]) => (
              <ThemeCard
                key={id}
                theme={t}
                selected={id === prefs.themeId}
                onSelect={() => setPrefs({ themeId: id })}
                badge={id.startsWith("custom-") ? "Custom" : undefined}
                onRemove={id.startsWith("custom-") ? () => removeTheme(id, t.name) : undefined}
              />
            ))}
          </div>
        </Panel>

        <Panel span={6} label="Accent">
          <div className="settings-stack">
            <Segmented
              size="sm"
              aria-label="Accent"
              options={[{ value: DEFAULT, label: "Theme" }, ...Object.keys(ACCENT_PRESETS), "custom"]}
              value={accentValue}
              onChange={(v) =>
                setPrefs({ accent: v === DEFAULT ? undefined : v === "custom" ? (prefs.accent ?? "#2fd9b4") : ACCENT_PRESETS[v] })
              }
            />
            {accentValue === "custom" && <AccentInput value={prefs.accent ?? ""} onCommit={(accent) => setPrefs({ accent })} />}
          </div>
        </Panel>

        <Panel span={6} label="Shape">
          <Segmented size="sm" aria-label="Shape" options={[{ value: DEFAULT, label: "Theme" }, ...SHAPES]} {...choose("shape")} />
        </Panel>
        <Panel span={4} label="Font">
          <Segmented size="sm" aria-label="Font" options={[{ value: DEFAULT, label: "Theme" }, ...FONTS]} {...choose("font")} />
        </Panel>
        <Panel span={4} label="Icons">
          <Segmented size="sm" aria-label="Icons" options={[{ value: DEFAULT, label: "Theme" }, ...ICON_STYLES]} {...choose("icons")} />
        </Panel>
        <Panel span={4} label="Density">
          <Segmented size="sm" aria-label="Density" options={[{ value: DEFAULT, label: "Theme" }, ...DENSITIES]} {...choose("density")} />
        </Panel>

        <Panel span={12} label="Contrast" meta={issues.length ? `${issues.length} below target` : "All pairs pass"}>
          {issues.length === 0 ? (
            <p className="settings-muted">Text meets 4.5:1 and edges and accent meet 3:1 on every surface.</p>
          ) : (
            <ul className="settings-errors">
              {issues.map((i) => (
                <li key={`${i.fg}-${i.bg}`}>
                  <code>{i.fg}</code> on <code>{i.bg}</code>: {i.ratio}:1, needs {i.min}:1
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel span={12} label="Theme file format">
          <ThemeFormatHelp />
        </Panel>
      </Grid>
    </PageFrame>
  );
}

function AccentInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const valid = /^#[0-9a-f]{6}$/i.test(draft);
  return (
    <Input
      label="Hex"
      value={draft}
      invalid={!valid}
      hint={valid ? "Press Enter to apply" : "Use #rrggbb"}
      onChange={(e) => setDraft(e.target.value.trim())}
      onKeyDown={(e) => e.key === "Enter" && valid && onCommit(draft)}
      onBlur={() => valid && onCommit(draft)}
    />
  );
}

function ThemeCard({
  theme,
  selected,
  onSelect,
  badge,
  onRemove,
}: {
  theme: Theme;
  selected: boolean;
  onSelect: () => void;
  badge?: ReactNode;
  onRemove?: () => void;
}) {
  return (
    <div className={cx("theme-card", selected && "is-selected")}>
      <button type="button" className="theme-card__hit" aria-pressed={selected} onClick={onSelect}>
        <ThemeScope theme={theme} className="theme-card__preview">
          <Panel label="Spend">
            <Stat size="sm" value="£1,284" delta="-4.2%" good />
            <Meter value={62} segments={16} tone="accent" height={8} />
          </Panel>
        </ThemeScope>
      </button>
      <div className="theme-card__foot">
        <span>{theme.name}</span>
        {badge && <Badge>{badge}</Badge>}
        {selected && <Badge tone="accent">Active</Badge>}
        {onRemove && <Button size="sm" variant="ghost" icon="x" aria-label={`Remove ${theme.name}`} onClick={onRemove} />}
      </div>
    </div>
  );
}

function ThemeFormatHelp() {
  return (
    <div className="settings-stack">
      <p className="settings-muted">
        A theme is a JSON file (<code>.json</code> or <code>.txt</code>). Every key but <code>name</code> is optional; missing colours
        come from the built-in Dark or Light palette, depending on <code>mode</code>. Use "Download current" for a complete starting point.
      </p>
      <pre className="settings-code">{`{
  "format": 1,
  "name": "Harbour",
  "mode": "dark",
  "colors": { "bg-300": "#0f1419", "ink-100": "#e6edf3", "accent": "#ffb454" },
  "shape": "machined",            // square | machined | soft | {"radius-xs":"2px","radius-sm":"6px"}
  "fonts": "geist",               // geist | plex | system | {"sans":"…","mono":"…","display":"…"}
  "icons": "square",              // square | rounded | bold
  "density": "default"            // compact | default | comfy
}`}</pre>
    </div>
  );
}
