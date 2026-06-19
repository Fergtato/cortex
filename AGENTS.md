# cortex — context for AI assistants / new contributors

A personal, **Notion-lite app**. Single-page app, styled like a
terminal **TUI** (monospace, sharp 1px outlines, no rounded corners, dark theme
with a configurable accent). This file is the handoff brief: read it before
making changes.

> Status at handoff: feature-complete for the scope below; clean build; on
> branch `main`. A backup branch + tag mark this exact point (see end).

---

## Stack & how to run

- **Frontend**: Vite + React 18 + TypeScript + **Tiptap 2** (rich-text editor).
- **Backend (optional)**: tiny Express + `better-sqlite3` API in `server/`.
- **Persistence**: pluggable — browser `localStorage` *or* the SQLite API.

```bash
npm install            # if it errors EACCES on the npm cache, add: --cache /tmp/cortex-npm-cache
npm run dev            # dev server → http://localhost:5173
npm run build          # tsc -b && vite build (type-check + bundle)

cd server && npm install && npm start   # SQLite API → http://localhost:3001
```

Docker (frontend nginx :8080 + api :3001, data in a named volume):
```bash
docker compose up -d --build   # rebuild after code changes; never touches the data volume
```

### ⚠️ Gotchas that will bite you
- **Tiptap is pinned to `2.27.2`** (last v2 line; the npm `latest` tag is v3,
  which is a breaking change). Every `@tiptap/*` dep must stay on this version.
- **npm global cache** on this machine has root-owned files → install with
  `--cache /tmp/cortex-npm-cache` if you hit `EACCES`.
- **Do NOT use `window.confirm/prompt/alert`.** They break once the user ticks
  "don't ask again". Use the in-app `useDialog()` (`confirm`/`prompt`/`choose`)
  from `src/components/Dialog.tsx`.
- **The Docker `web` image must be rebuilt** to reflect code changes; otherwise
  `:8080` serves a stale build. The user's data lives in the `pt-data` volume
  (SQLite) and survives rebuilds.
- **Port 3001** is sometimes held by a stray local `node` server
  (`lsof -ti:3001 | xargs kill`).
- `@tiptap/react` **`NodeViewContent` renders an extra inner wrapper div**, so
  CSS that targets node-view children needs to go one level deeper
  (e.g. `.pt-toggle-body > * > *`, not `> *`). This trips up collapse/grid CSS.

---

## Architecture

### Data model (`src/types.ts`)
- **Page**: `{ id, title, content (Tiptap HTML), parentId, createdAt, updatedAt }`.
  Pages form a tree via `parentId` (null = top-level project) — stored flat in a
  `PageMap`, tree derived by filtering.
- **Database** (standalone, NOT owned by a page): `{ id, name, properties[],
  rows[], views[], activeViewId }`. `PropertyDef.type` ∈ text | number | select |
  date | checkbox | url | image (first property is the protected "title").
  `DatabaseRow.cells` is keyed by property id. `views` are table | gallery |
  timeline.
- **Filtering/sort** (per page embed, not on the db): `FilterCondition[]` +
  `DbSort`. Type-aware operators in `src/components/database/filtering.ts`.

### State & persistence
- **`src/store.ts` `useStore()`** — the in-memory store (React state) for pages +
  databases, with all CRUD ops. Loads **async** on mount via a storage adapter
  and saves **debounced**; a `loaded` flag guards against writing the empty
  initial state over real data.
- **`src/storage/adapters.ts`** — `StorageAdapter` interface with
  `LocalStorageAdapter` and `ApiAdapter`; `getAdapter()` picks based on config.
  Both operate on whole collections (GET map / PUT replace-all).
- **`src/storage/datasource.ts`** — the local|api choice + apiUrl (stored in
  localStorage so the app knows where to read everything else from). Switching
  data source reloads the app.
- **localStorage keys**: `cortex:pages:v1`, `:databases:v1`,
  `:settings:v1`, `:datasource:v1`, `:sidebar`. Settings + data-source choice +
  sidebar state always live in localStorage; pages/databases follow the chosen
  source.
- **The user currently runs in API (SQLite) mode** — their real data is in
  `server/data.db` (or the Docker `pt-data` volume), not localStorage.

### React contexts (`src/context.ts`)
`StoreContext`/`useStoreContext()` and `NavContext`/`useNav()` let deeply-nested
components (notably editor node views like the database embed) reach the store
and navigate. Provided in `App.tsx`.

### Settings (`src/settings.ts` + `components/SettingsPanel.tsx`)
`useSettings()` writes CSS variables onto `:root` (so `styles.css` re-themes for
free): accent colour (7 presets incl. white), theme/background (midnight/slate/
carbon), font, CRT-glow toggle, and a **data-source** section (localStorage vs
API URL, with a connection test). When adding colours in CSS, use the CSS vars
so they respond to settings.

### Editor (`src/components/Editor.tsx` + `Toolbar.tsx`)
- **One stable Tiptap editor instance** is created and reused; switching pages
  swaps its content (do NOT recreate per page — it's racy under StrictMode and
  drops focus/edits). `focusEmptyArea` only focuses on clicks on the blank
  editor area, never inside node views.
- **Marks/extensions**: StarterKit, task lists, placeholder, Link
  (external, opens new tab), TextStyle+Color+Highlight, Table (+row/header/cell,
  class `.content-table` to avoid clashing with database tables).
- **Custom inline nodes**: `SubpageLink.ts` (inline link to a subpage),
  `ResizableImage.tsx` (drag-resize + aspect-ratio crop; images stored as
  downscaled data URLs via `src/lib/image.ts`), `DatabaseEmbed.tsx` (embeds a
  standalone database; editable data but schema-locked; per-embed filters/sort on
  the node attrs).
- **Custom block nodes** in `src/components/editor/`: `Toggle.tsx` (collapsible;
  first child = title; border toggle), `Columns.tsx` (2–5 CSS-grid columns +
  borders toggle), `Tabs.tsx` (tabbed content). All use React node views; the
  toolbar inserts them.
- The **toolbar is sticky** to the top of the content panel and wraps on narrow
  screens (with horizontal + vertical separators).

### Database UI (`src/components/database/`)
`DatabaseBlock.tsx` renders a database (full view via sidebar, or `embedded`
+`lockSchema` inside a page). Views: `TableView`, `GalleryView` (first image
property becomes a card cover), `TimelineView`. `FilterBar.tsx` is the Notion-
style filter chips + popovers; `filtering.ts` has the matching logic. Cells are
edited via `Cell.tsx` (checkbox cells wrapped in `.cell-checkbox-wrap` because a
global `input[type=checkbox]{margin:0}` rule out-specificities a bare margin).

### Sidebar & responsiveness (`App.tsx`, `styles.css`)
Collapsible sidebar (toggle persists in localStorage); on phones it becomes an
overlay drawer that auto-closes after navigation, and the content goes
full-width.

### Server (`server/`)
Express + better-sqlite3 on port 3001. One row per entity, JSON in a `data`
column. Endpoints: `GET/PUT /api/pages`, `GET/PUT /api/databases`,
`GET /api/health`. `DB_PATH` env overrides the SQLite file location (used by
Docker to point at the mounted volume). Multi-stage Dockerfile compiles
better-sqlite3 in a build stage so the runtime image stays slim.

---

## Conventions
- **Commit after each working, verified change** (one logical change per commit).
  Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
  (adjust the co-author for whoever/whatever is now authoring).
- Match the existing TUI style: monospace, sharp corners, CSS variables for
  colour, terse lowercase labels.
- Verify previewable changes in the browser before committing.

## Key files (map)
```
src/main.tsx                     root; wraps <App> in <DialogProvider>
src/App.tsx                      layout, selection (page|database), sidebar, providers
src/store.ts                     useStore() — state + CRUD + adapter load/save
src/storage/{adapters,datasource}.ts   pluggable persistence
src/settings.ts                  theme/accent/font/glow + data-source config
src/context.ts                   StoreContext + NavContext
src/types.ts                     all shared types
src/lib/image.ts                 image picker + downscale → data URL
src/components/
  Editor.tsx, Toolbar.tsx        the rich-text editor + toolbar
  Dialog.tsx                     in-app confirm/prompt/choose (use instead of window.*)
  SettingsPanel.tsx              settings modal
  PageTree.tsx                   recursive sidebar page tree
  SubpageLink.ts, ResizableImage.tsx, DatabaseEmbed.tsx   custom editor nodes
  editor/{Toggle,Columns,Tabs}.tsx                        custom block nodes
  database/{DatabaseBlock,TableView,GalleryView,TimelineView,Cell,FilterBar,filtering}.ts(x)
server/                          Express + SQLite API (+ Dockerfile)
Dockerfile, nginx.conf, docker-compose.yml   frontend container + stack
```
