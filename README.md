# Cortex

A personal, Notion-lite workspace for organising projects, notes, and databases.
Every project is a **page** with a rich-text editor; pages nest into arbitrarily
deep **subpages**. Any page can embed a **database** with table, gallery, and
timeline views, filters, and sorting. The whole UI is skinned like a terminal
TUI — monospace, sharp 1px outlines, no rounded corners, dark theme with a
configurable accent colour.

Data lives either in the browser's `localStorage` or in a small local
**SQLite API** (`server/`), switchable at any time from Settings → data source.

> **Working on the codebase (human or AI)?** Read **[AGENTS.md](AGENTS.md)**
> first — it's the architecture brief and lists the gotchas (pinned Tiptap
> version, no native dialogs, Docker rebuild step, pluggable storage, etc.).

---

## Features

- **Rich-text editor** (Tiptap) — bold, italic, strikethrough, inline code,
  text colour and highlight, headings, bullet / ordered / task lists,
  blockquotes, code blocks, tables, horizontal rules, and external links.
- **Custom blocks** — collapsible toggle lists, 2–5 column layouts, and tabbed
  content sections, all inserted from the toolbar.
- **Pages & subpages** — infinitely nestable tree with breadcrumbs, recursive
  sidebar, in-place reordering, and recursive delete.
- **Databases** — standalone or embedded in any page, with text / number /
  select / date / checkbox / url / image properties. Views:
  - **Table** — sort and filter, inline cell editing.
  - **Gallery** — card view with the first image property as cover.
  - **Timeline** — date-based layout.
  - Notion-style **filter chips** with type-aware operators, plus per-embed
    filters and sort.
- **Images** — drag-to-resize with aspect-ratio crop, downscaled to data URLs
  on insert.
- **Theming** — 7 accent colours, 3 dark themes (midnight / slate / carbon),
  monospace font choice, and a CRT-glow toggle. All via CSS variables.
- **Responsive** — collapsible sidebar that becomes an overlay drawer on
  phones; content goes full-width.
- **Pluggable persistence** — `localStorage` for a zero-setup local app, or a
  tiny Express + SQLite API for data that survives the browser and can be
  backed up as a single file.

---

## Quick start

```bash
npm install
npm run dev          # → http://localhost:5173
```

Requires Node 18+ (developed on Node 24). If your global npm cache errors with
`EACCES`, add `--cache /tmp/cortex-npm-cache` to the install command.

```bash
npm run build        # tsc type-check + vite production build into dist/
npm run preview      # serve the production build locally
```

By default the app uses `localStorage`. To use the SQLite API instead, start
it (`cd server && npm install && npm start` → `http://localhost:3001`), then
in the app open **⚙ settings → data source → API (SQLite)**, enter the URL,
**test connection**, and **apply**.

---

## Run with Docker

Runs the frontend (nginx) and the API + SQLite backend together, with a named
volume so data survives restarts:

```bash
docker compose up -d --build
```

- App → http://localhost:8080
- API → http://localhost:3001 (SQLite stored in the `pt-data` volume)

Then in the app: **⚙ settings → data source → API (SQLite)**, URL
`http://localhost:3001`, **test connection**, **apply**.

```bash
docker compose down          # stop (data survives)
docker compose down -v       # stop and delete the data volume
docker compose up -d --build api   # backend only (run frontend via `npm run dev`)
```

> **Note:** Docker Compose prefixes named volumes with the project name
> (defaults to the folder name). Renaming the project folder will create a
> fresh empty volume and orphan the old data. The included `docker-compose.yml`
> pins the volume name externally to avoid this.

---

## Architecture

Single-page React app with an optional local API.

```
┌──────────────────────────── Browser ────────────────────────────┐
│  React (Vite + TS) + Tiptap editor                              │
│    App.tsx ── Sidebar / PageTree + Editor / Toolbar              │
│    useStore()  ← in-memory store (pages + databases, CRUD)       │
│         │  read on load / debounced write (250ms)                │
│         ▼                                                        │
│  StorageAdapter ──┬─ LocalStorageAdapter  (localStorage)         │
│                   └─ ApiAdapter         (fetch → SQLite API)     │
└──────────────────────────────────────────────────────────────────┘
                                  │ (when API mode)
                                  ▼
┌──────────────────── Express + better-sqlite3 ───────────────────┐
│  GET/PUT /api/pages   GET/PUT /api/databases   GET /api/health   │
│  one row per entity, JSON in a `data` column → server/data.db    │
└──────────────────────────────────────────────────────────────────┘
```

### Frontend
**Vite + React 18 + TypeScript**, rich text via **Tiptap 2** (pinned to
`2.27.2`, the last v2 release — do not let npm upgrade to v3). State lives in
a single `useStore()` hook (`src/store.ts`) holding a flat `PageMap` and
`DatabaseMap`; the page tree is derived by filtering on `parentId`. Custom
editor nodes (`SubpageLink`, `ResizableImage`, `DatabaseEmbed`, `Toggle`,
`Columns`, `Tabs`) are React node views. Deeply-nested components reach the
store and navigation via React contexts.

### Persistence
A `StorageAdapter` interface (`src/storage/adapters.ts`) abstracts
`LocalStorageAdapter` and `ApiAdapter`; `getAdapter()` picks based on the
data-source setting stored in localStorage. Both operate on whole collections
(GET map / PUT replace-all), so the store is the single source of truth and
swapping backends requires no UI changes. The API server (`server/index.js`)
is ~60 lines of Express with two tables (`pages`, `databases`), each one row
per entity with its JSON in a `data` column.

### Settings
`useSettings()` writes CSS variables onto `:root`, so `styles.css` re-themes
for free — accent colour, theme/background, font, CRT-glow, and the data-source
config with a connection test.

See **[AGENTS.md](AGENTS.md)** for the full file map, conventions, and gotchas.

---

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | Vite, React 18, TypeScript, Tiptap 2 |
| Backend  | Express, better-sqlite3 |
| Deploy   | Docker (nginx + api), docker-compose |

---

## Project structure

```
cortex/
├── index.html
├── vite.config.ts
├── package.json
├── src/
│   ├── main.tsx                # React root; mounts <App>
│   ├── App.tsx                 # layout, sidebar, providers
│   ├── store.ts                # useStore() — state + CRUD + adapter load/save
│   ├── types.ts                # Page / Database / View / Filter types
│   ├── settings.ts             # theme/accent/font/glow + data-source config
│   ├── context.ts              # StoreContext + NavContext
│   ├── styles.css              # all styling (the TUI look lives here)
│   ├── lib/image.ts            # image picker + downscale → data URL
│   ├── storage/                # pluggable persistence + key migration
│   └── components/
│       ├── Editor.tsx, Toolbar.tsx
│       ├── Dialog.tsx          # in-app confirm/prompt/choose (no window.*)
│       ├── SettingsPanel.tsx, PageTree.tsx
│       ├── SubpageLink.ts, ResizableImage.tsx, DatabaseEmbed.tsx
│       ├── editor/             # Toggle, Columns, Tabs block nodes
│       └── database/           # DatabaseBlock + Table/Gallery/Timeline views
├── server/                     # Express + SQLite API (+ Dockerfile)
├── Dockerfile, nginx.conf, docker-compose.yml
└── AGENTS.md                   # architecture brief for contributors
```

---

## License

[MIT](LICENSE) © Fergus
