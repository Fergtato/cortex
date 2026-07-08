# Dashboards — Staged Implementation Plan

## Context

Cortex currently has two content kinds: **pages** (hierarchical Tiptap notes) and **databases** (typed rows + views). We're adding a third kind: **dashboards** — a bento-box grid of composable **widgets** (clock, timer, text, lists, DB views, charts, metrics, habit trackers, forms, action buttons, and eventually external-API panels) that act as "command centres" (project tracker, fitness tracker, finance, daily routine).

This is a large feature, so it's split into independently-shippable stages. Each stage is a stopping point that leaves the app fully working, so it can be actioned one at a time to control token spend. **Stage 0** is a prerequisite polish pass on the existing database folders; **Stage 1–2** stand up the framework; later stages add widget families.

### Locked decisions (from clarifying questions)
- **Layout engine:** Fixed N-column CSS grid; widgets occupy a rectangular `{x,y,w,h}` block. Edit mode = drag to move + edge/corner handles to change span. No external grid library.
- **Sizing:** Per-dashboard toggle `fit` (fills viewport, no scroll) vs `scroll`; default `fit`.
- **Folder chrome:** Remove the folder *icon* only; keep the ▶/▼ toggle arrow.
- **External APIs:** Deferred to the final stage (needs a backend proxy for CORS/secrets).
- **Charts (my recommendation):** Hand-rolled SVG (bar/line/multiline/pie) — matches the TUI aesthetic and the project's zero-heavy-deps philosophy. Shared between a new database "chart" view and the dashboard chart widget.

### Codebase conventions to honour (from `AGENTS.md` + exploration)
- TUI style: monospace, sharp 1px borders, `border-radius: 0`, **CSS variables only** (`--bg`, `--fg`, `--accent`, `--line`, `--sel-*`, etc. in `src/styles.css`).
- No native `confirm/prompt/alert` — use `useDialog()` (`src/components/Dialog.tsx`).
- Store (`src/store.ts`) is **strictly immutable**; unchanged entities keep object identity so the debounced diff-save (`diffMap`) only persists what changed. Every new mutation must follow this.
- Persistence guarded by `loaded` flag; collections are `Record<id, entity>` maps saved via `CollectionDelta` deltas.
- Icons: `Icon` + `IconPicker` (`src/components/Icon.tsx`, `IconPicker.tsx`), names are kebab-case, colour is a `SelectColor`.

---

## Stage 0 — Database folder polish (prerequisite)

**Goal:** Fix folder UX in the existing database section, then reuse the pattern for dashboard folders.

Changes in `src/components/DatabaseTree.tsx` + `src/App.tsx` + `src/store.ts`:
1. **Inline rename with auto-select on create.** Today rename only exists via the `⋯` menu → `dialog.prompt` (`DatabaseTree.tsx:215-243`), and `store.createFolder()` (`store.ts:449`) just drops a "New folder" with no follow-up (`App.tsx:209-214`). Add an **inline editable name** (a text `<input>` swapped in for `.db-list-name`) that:
   - Opens automatically when a folder is freshly created (mirror the `justCreated` ref + `titleRef.select()` pattern used for pages in `App.tsx:61-63,118-124`). Simplest approach: `createFolder` returns the id; App sets a `renamingId` state; `FolderRow` renders the input + `autoFocus`/`select()` when `folder.id === renamingId`.
   - Commits on Enter/blur, cancels on Escape, using `store.renameFolder`.
   - Also reachable via double-click on the folder name (keep the `⋯` menu's Rename as a fallback, or point it at the same inline flow).
2. **Remove the folder icon**, keep the toggle arrow. Delete the `<Icon name="folder" .../>` at `DatabaseTree.tsx:266`; leave the `.db-folder-toggle` (▶/▼) at line 265.
3. Extract the inline-rename input into a tiny shared component (e.g. `src/components/InlineRename.tsx`) so Stage 1's dashboard folders reuse it verbatim rather than triple-duplicating.

**Files:** `src/components/DatabaseTree.tsx`, `src/components/InlineRename.tsx` (new), `src/App.tsx`, `src/styles.css` (input styling to match `.db-list-name`). No data-model change.

---

## Stage 1 — Dashboards: data model, persistence, sidebar, navigation

**Goal:** A third sidebar section with folders, create/rename/delete/drag-reorder, opening an (empty) dashboard shell. No widgets yet.

### Data model (`src/types.ts`)
```ts
export interface Widget {
  id: string;
  type: WidgetType;              // union, grows per stage
  x: number; y: number;          // top-left grid cell (0-based)
  w: number; h: number;          // span in columns/rows
  config: Record<string, unknown>; // per-type; validated by each widget
}
export interface Dashboard {
  kind?: "dashboard";
  id: string;
  name: string;                  // sidebar label only (no in-body title)
  icon?: string; iconColor?: SelectColor;
  widgets: Widget[];
  columns: number;               // grid column count (default 12)
  rowHeight: number;             // px per grid row (default e.g. 40)
  sizing: "fit" | "scroll";      // default "fit"
  folderId?: string | null; order?: number;
  createdAt: number; updatedAt: number;
}
export type DashItem = Dashboard | Folder;      // reuse existing Folder
export type DashboardMap = Record<string, DashItem>;
export type WidgetType = "text" | "clock"; // extended each stage
```
Reuse the existing `Folder` interface and `isFolder` guard; add an `isDashboard` guard mirroring `isDatabase`.

### Persistence (mirror the databases collection exactly)
- `src/storage/adapters.ts`: add `loadDashboards()` / `saveDashboards(delta)` to `StorageAdapter`; implement in `LocalStorageAdapter` (key `cortex:dashboards:v1`) and `ApiAdapter` (`get("dashboards")`/`patch("dashboards", delta)`).
- `server/index.js`: add `"dashboards"` to the table loop (`:28`) and call `collectionRoutes("dashboards")` (`:99`). One line each — routes are generic.
- `src/store.ts`: add `dashboards` state + `savedDashboards` ref, a `normalizeDashboardOrder` (copy of `normalizeDbOrder`), the load/save `useEffect` (copy the db block `:223-238`), and store methods: `createDashboard`, `renameDashboard`, `deleteDashboard`, `createDashFolder`, `renameDashFolder`, `deleteDashFolder`, `moveDashItem`, `updateDashboard(id, fn)`, plus selectors `topLevelDashItems`, `dashboardsInFolder`, `getDashboard`. These are near-verbatim copies of the database equivalents (`store.ts:381-531`).

### Sidebar + navigation
- `src/App.tsx`: add a third section label "dashboards" with `+` (new dashboard) and `⊞` (new folder) buttons after the databases section (`App.tsx:232`). Render a new `<DashboardTree>`.
- `src/components/DashboardTree.tsx` (new): copy `DatabaseTree.tsx` structure (DnD context, `DbRow`→`DashRow`, `FolderRow`) but folders use the **Stage 0** inline-rename + no folder icon. Dashboard rows show the dashboard's chosen `icon` (via `Icon`) or a default glyph.
- Extend the `Selection` union in `App.tsx:17-20` with `{ kind: "dashboard"; id }`, add `openDashboard`, extend `NavContext`, the deletion-cleanup effect (`:129-133`), and the footer count.
- **Icon picker for dashboards:** reuse the `IconPicker` pattern; a dashboard has no title, so expose the icon control in the dashboard's edit-mode toolbar (Stage 2) — it only sets the sidebar icon.

### Dashboard shell (main pane)
- `src/components/dashboard/DashboardView.tsx` (new): rendered when `sel.kind === "dashboard"`. For this stage it shows an empty grid placeholder + a view/edit toggle button (non-functional grid until Stage 2). Follows the `.db-block` header pattern but with no name field in the body.

**Files:** `src/types.ts`, `src/storage/adapters.ts`, `server/index.js`, `src/store.ts`, `src/App.tsx`, `src/context.ts`, `src/components/DashboardTree.tsx` (new), `src/components/dashboard/DashboardView.tsx` (new), `src/styles.css`.

---

## Stage 2 — Bento grid engine + view/edit modes (the core)

**Goal:** A working fixed-grid bento layout you can edit: add/move/resize/remove widget cells, toggle view↔edit, toggle fit↔scroll. Prove it with 2 trivial widgets (text, clock).

### Grid model & rendering (`src/components/dashboard/DashboardGrid.tsx`, new)
- CSS Grid: `grid-template-columns: repeat(var(--cols), 1fr)`. In **fit** mode `grid-template-rows: repeat(var(--rows), 1fr)` sized to fill the pane (`height: 100%`, no scroll); in **scroll** mode rows are `var(--row-h)` px and the container scrolls.
- Each widget positioned with `grid-column: x+1 / span w; grid-row: y+1 / span h`.
- A `WidgetFrame` wraps every widget: 1px border, optional title bar, and (in edit mode) a remove `×`, a drag affordance, and resize handles (right, bottom, bottom-right corner).

### Edit interactions (edit mode only) — native HTML5 DnD / pointer events (no lib)
- **Move:** drag a widget; compute target cell from pointer position over the grid; commit `{x,y}` via `store.updateDashboard`. Show a ghost/highlight of the target block; clamp within `columns`; reject overlaps (or push — start with reject + snap-back).
- **Resize:** pointer-drag handles change `{w,h}` in whole-cell increments; clamp to grid bounds and min 1×1.
- **Add:** empty grid cells render a `+` affordance in edit mode → opens a **widget picker** popover (`WidgetPicker`, listing registered types) that inserts a default-sized widget at that cell.
- **Remove:** `×` on the frame → `useDialog().confirm` → remove from `widgets`.
- All mutations go through `store.updateDashboard(id, d => ({...d, widgets: ...}))` preserving immutability.

### Widget registry (`src/components/dashboard/widgets/registry.ts`, new)
A single source of truth mapping `WidgetType → { label, icon, defaultSize, defaultConfig, Component, ConfigForm? }`. `DashboardGrid` renders `entry.Component` with `{ widget, dashboard, store, editing }`. Every later stage just registers new entries here — the grid never changes. This is the key extensibility seam.

### Toolbar
- View/Edit toggle (reuse the `.db-embed-edit` "✎ edit" / "✓ done" pattern from `DatabaseEmbed.tsx`).
- In edit mode: column-count control, fit/scroll toggle, and the dashboard **icon picker** button.

### Widgets to ship this stage (minimal, prove the frame)
- **Text** (`type: "text"`): simple editable text box. Start with a plain `<textarea>`-backed rich-ish box (defer full Tiptap embed); config stores the string.
- **Clock** (`type: "clock"`): digital date/time via `setInterval`; config toggles 12/24h, show-seconds, show-date.

**Files:** `src/components/dashboard/DashboardGrid.tsx`, `WidgetFrame.tsx`, `WidgetPicker.tsx`, `widgets/registry.ts`, `widgets/TextWidget.tsx`, `widgets/ClockWidget.tsx` (all new), `src/components/dashboard/DashboardView.tsx` (wire in grid + toolbar), `src/styles.css`.

**Responsiveness note:** widgets must adapt to their cell (container-relative sizing, `overflow` handling, `container queries` where useful). Bake this into `WidgetFrame` from the start.

---

## Stage 3 — Self-contained simple widgets

Register (in `widgets/registry.ts`) with no external data:
- **Timer** (`timer`): countdown with quick-start presets (30s, 1m, 1.5m, 2m…), start/pause/reset, chime/flash on zero. Config = preset list + default.
- **Image** (`image`): reuse `pickImage()` (`src/lib/image.ts`) → stores data URL; object-fit fit/fill config.
- **Standalone list / todo** (`list`): local checklist stored in `config.items`; add/check/reorder/delete. (DB-linked variant comes in Stage 4.)
- **Dummy sci-fi widget** (`scifi`): animated nonsensical readouts (fake telemetry, bar meters, scrolling hex) with a few style presets — pure CSS/SVG, for batcave flavour.
- **Rich text upgrade (optional):** swap the Stage-2 text box for a lightweight Tiptap-backed box if desired (watch the "one stable editor instance" gotcha — a dashboard may have many text widgets, so use *independent* small editors here, not the shared page editor).

**Files:** `widgets/TimerWidget.tsx`, `ImageWidget.tsx`, `ListWidget.tsx`, `ScifiWidget.tsx` (new) + registry entries.

---

## Stage 4 — Database-connected widgets

Reuse existing database plumbing (`DatabaseBlock`, `filtering.ts`, `aggregate.ts`, `computedCellValue`).
- **DB view widget** (`db-view`): pick a database + one of its views; render `<DatabaseBlock db embedded minimal lockSchema viewId=…>`. Config persists `{ databaseId, viewId }` only (per the "view config lives on the view" gotcha). This directly answers "add a database view to a dashboard" with zero new view logic.
- **DB-linked list** (`list` extended, or `db-list`): pull rows from a chosen DB with a filter (e.g. Status/Date = "today"); checking an item writes back via `store.updateCell`. Reuse `matchesAll` from `filtering.ts`.
- **Metric widget** (`metric`): big-number readout = an aggregation (`aggregate.ts` / `AGG_OPS`) over a chosen DB + optional filter (e.g. "tasks with Status=todo on this date"). Config `{ databaseId, propId, op, filters }`.
- **Habit tracker** (`habit`): GitHub-activity-style calendar grid over a DB with a date property — count rows per day, colour cells by intensity. Reuse date-cell logic from `CalendarView.tsx`.

**Files:** `widgets/DbViewWidget.tsx`, `MetricWidget.tsx`, `HabitWidget.tsx`, list extension (new) + registry entries. Small helper for "resolve rows of a DB with a filter" factored out of `DatabaseBlock`'s `useMemo` (`DatabaseBlock.tsx:109-122`) to avoid duplication.

---

## Stage 5 — Charts (database view + dashboard widget)

**Goal:** Hand-rolled SVG charts, shared by databases and dashboards.
- Add `"chart"` to `ViewType` (`types.ts:106-109`) and a `DatabaseView` chart config (`chartKind: "bar"|"line"|"multiline"|"pie"`, `xPropId`, `yPropId`/`agg`, `groupByPropId`). Register in `VIEW_TYPES`, add `VIEW_ICON` entry, and a `ChartView` branch in `DatabaseBlock`'s switch (`DatabaseBlock.tsx:222-259`).
- `src/components/database/ChartView.tsx` (new): pure SVG using CSS vars for colours (`--accent`, `--sel-*`). Aggregate rows via existing helpers.
- **Dashboard chart widget** (`chart`): thin wrapper that reuses `ChartView` with `{ databaseId, chartConfig }`.

Doing both at once satisfies "I'd like charts in databases too — maybe at the same time."

**Files:** `src/types.ts`, `src/components/database/ChartView.tsx` (new), `src/components/database/DatabaseBlock.tsx`, `src/components/dashboard/widgets/ChartWidget.tsx` (new) + registry.

---

## Stage 6 — Forms widget

- **Form** (`form`): pick a target DB; choose which properties are *input* fields vs *hidden defaults* (e.g. name input + priority select + date, with Status defaulting to "todo"). Submit → `store.addRow(dbId, cells)`. Reuse `Cell.tsx` editors for inputs where possible; config = `{ databaseId, fields: [{propId, mode:"input"|"default", defaultValue}] }`.

**Files:** `widgets/FormWidget.tsx` (new) + registry.

---

## Stage 7 — Action buttons

- **Action button** (`button`): appearance variants (text-only / icon-only / icon+text / icon+text+live-status). Config = one action:
  - `reset-list` (reset a list widget in the same dashboard to defaults),
  - `create-row` (insert a DB row from set defaults — reuse `store.addRow`),
  - `swap-widget` (toggle a cell between two configured widgets),
  - `run-api` (stubbed until Stage 8).
- Cross-widget actions (reset-list, swap-widget) need widgets to be addressable within a dashboard — they already have stable `id`s, so actions reference target widget ids.

**Files:** `widgets/ActionButtonWidget.tsx` (new) + registry; small dashboard-action dispatcher.

---

## Stage 8 — External API integrations (deferred, largest)

Backend-proxied connections (secrets + CORS): Homey Pro, Google Health, Docker, extensible.
- Add a connections config + proxy routes in `server/index.js` (store credentials server-side; never in the client bundle). New settings UI to add/authorise a connection.
- API-backed widget variants: **metric** (e.g. steps today), **action button** (`run-api`, e.g. trigger a Homey flow), **live status** on buttons, live-data panels (Docker container health).
- Optional **globe/map with pins** (`map`): lightweight inline SVG world map + pin overlay (avoid heavy Leaflet/MapLibre to preserve the minimal-deps philosophy) — only if wanted; can be its own sub-stage.

**Files:** `server/index.js`, new `src/storage`/settings connection config, `widgets/*` API variants.

---

## Dropped / reconsidered
- **"Layout widget" (nested 2×2 sub-grid):** unnecessary given fixed grid + span resize — a widget can already occupy any rectangular block, and the picker can place several small widgets directly. Skip unless a real need appears.
- **Globe/map:** kept but pushed to Stage 8 and constrained to a lightweight SVG approach.

## Cross-cutting principles
- Every widget is registered in one registry; the grid/frame code is written once and never edited per widget.
- All widget state persists inside `Dashboard.widgets[].config`; no new top-level collections beyond `dashboards`.
- Strict immutability on every store mutation (protects the diff-save).
- CSS variables only; container-responsive widgets; sharp TUI styling.

## Verification (per stage)
Run frontend: `npm run dev` (http://localhost:5173); type-check: `npm run build`. Use the preview tools to drive the UI:
- **Stage 0:** create a DB folder → confirm inline name auto-selects; type + Enter renames; folder icon gone, arrow remains; drag a database in/out still works.
- **Stage 1:** new "dashboards" section appears; create/rename/delete/drag dashboards + folders; open a dashboard → empty shell; reload → persists (check `localStorage['cortex:dashboards:v1']`, and with the API backend, the new `dashboards` SQLite table).
- **Stage 2:** toggle edit; add text + clock widgets from the picker; drag to move, resize via handles; remove; toggle fit vs scroll; reload persists layout; clock ticks; verify no overlap and clamping at grid edges. Screenshot to confirm bento appearance.
- **Stages 3–7:** for each widget, add it, configure it, confirm live behaviour (timer counts down, DB view renders the chosen view, metric matches a hand-computed aggregate, form submit adds a row visible in the DB, chart matches the data, action button performs its action). Confirm each is responsive by resizing its cell.
- **Stage 8:** mock/live connection returns data into a metric/button; secrets never appear in the client bundle (grep `dist/`).
- Run `npm run build` after each stage to keep the type-check green.
