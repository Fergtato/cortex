# Cortex

A personal, Notion-lite workspace for organising projects, notes, and databases.
Every project is a **page** with a rich-text editor; pages nest into arbitrarily
deep **subpages**. Any page can embed a **database** with table, gallery, and
timeline views, filters, and sorting. The whole UI is skinned like a terminal
TUI — monospace, sharp 1px outlines, no rounded corners, dark theme with a
configurable accent colour.

Data lives either in the browser's `localStorage` or in a (self-hosted)
**Supabase** instance — with invite-only accounts, per-user data, and image
storage — switchable at any time from Settings → data source.

> **Working on the codebase (human or AI)?** Read **[AGENTS.md](AGENTS.md)**
> first — it's the architecture brief and lists the gotchas (pinned Tiptap
> version, no native dialogs, Docker rebuild step, pluggable storage, etc.).

---

## Features

- **Rich-text editor** (Tiptap) — bold, italic, strikethrough, inline code,
  text colour and highlight, headings, bullet / ordered / task lists,
  blockquotes, code blocks, tables, horizontal rules, and external links.
- **Slash commands** — type `/` to insert any block inline, with fuzzy filter
  and keyboard navigation.
- **Custom blocks** — collapsible toggle lists, 2–5 column layouts, and tabbed
  content sections, from the toolbar or the `/` menu.
- **Pages & subpages** — infinitely nestable tree with breadcrumbs, recursive
  sidebar, in-place reordering, recursive delete, plus per-page **emoji icons**
  and **cover images**.
- **Databases** — standalone or embedded in any page, with text / number /
  select / multi-select / date / checkbox / url / image / **formula** /
  created-time / last-edited-time / auto-id properties.
  - **Coloured select options** — 9-colour palette; single select tints the
    whole cell, multi-select renders coloured pills; options can be renamed,
    recoloured, and deleted in-place.
  - **Table** — sort, filter, group-by with collapsible sections, per-column
    calculations (count/sum/avg/min/max/…), text-wrap toggle per column,
    drag-to-reorder columns, row hover highlight.
  - **Gallery** — card view with image cover and a fit/fill toggle.
  - **Kanban** — drag cards between coloured option columns.
  - **Calendar** — month grid on any date property; click a day to add.
  - **Timeline** — date-based layout.
  - **Per-view config** — each view owns its filters, sort, grouping, and
    display options, shared everywhere that view appears.
  - **Formulas** — a small safe expression language (`{Price} * {Qty}`,
    `if(...)`, `concat(...)`, …) computed live, sortable and filterable.
  - Embeds render as a **simple titled table** with an edit toggle that
    reveals view switching, filters, sort, and new-row controls.
- **Images** — drag-to-resize with aspect-ratio crop, downscaled to data URLs
  on insert.
- **Theming** — 7 accent colours, 3 dark themes (midnight / slate / carbon),
  monospace font choice, and a CRT-glow toggle. All via CSS variables.
- **Responsive** — collapsible sidebar that becomes an overlay drawer on
  phones; content goes full-width.
- **Pluggable persistence** — `localStorage` for a zero-setup local app, or
  **Supabase** (Postgres + Auth + Storage) for data that follows you to any
  device. Supabase mode adds email/password sign-in (invite-only — you create
  accounts in Studio), Row Level Security so each account only sees its own
  data, image uploads to a private Storage bucket, and a `proxy` Edge Function
  for dashboard API connections — see
  [docs/supabase-setup.md](docs/supabase-setup.md) for the step-by-step guide.
- **Backup / restore** — export the whole workspace as one `.json` file and
  import it again (into either backend; inline images are uploaded to Storage
  when importing into Supabase).

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

By default the app uses `localStorage`. To use Supabase, follow
[docs/supabase-setup.md](docs/supabase-setup.md), then open
**⚙ settings → data source → Supabase**, enter the URL and anon key,
**test connection**, **apply**, and sign in.

---

## Run with Docker

Builds the frontend and serves it with nginx:

```bash
docker compose up -d --build     # → http://localhost:8080
```

To have the build default to your Supabase instance, create a `.env` next to
`docker-compose.yml`:

```bash
VITE_SUPABASE_URL=https://supabase.example.com
VITE_SUPABASE_ANON_KEY=<anon key>   # public key only — never the service-role key
```

---

## Architecture

Single-page React app; optionally backed by a Supabase instance.

```
┌──────────────────────────── Browser ─────────────────────────────┐
│  React (Vite + TS) + Tiptap editor                               │
│    AuthGate ── sign-in (Supabase mode) ── App.tsx                │
│    useStore()  ← in-memory store (pages, databases, dashboards)  │
│         │  read on load / debounced incremental write (250ms)    │
│         ▼                                                        │
│  StorageAdapter ──┬─ LocalStorageAdapter  (localStorage)         │
│                   └─ SupabaseAdapter      (supabase-js)          │
└──────────────────────────────────────────────────────────────────┘
                                  │ (Supabase mode)
                                  ▼
┌──────────────────────── Supabase (self-hosted) ──────────────────┐
│  Auth: email/password, sign-up disabled (invite-only)            │
│  Postgres: pages / databases / dashboards — one row per entity,  │
│            JSON in `data`, RLS: user_id = auth.uid()             │
│  Storage:  private `cortex-files` bucket, <uid>/<file>           │
│  Edge Function `proxy`: API connections with server-side secrets │
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
`LocalStorageAdapter` and `SupabaseAdapter`; `getAdapter()` picks based on the
data-source setting stored in localStorage. Loads read the whole collection
(paginated in Supabase); saves are **incremental** — the store diffs against
the last-persisted snapshot and sends only changed/deleted entities
(`{ upserts, deletes }`), so one edit never re-serializes the whole
collection. The schema lives in `supabase/migrations/0001_cortex.sql`.

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
| Backend  | Supabase (Postgres, Auth, Storage, Edge Functions) — optional |
| Deploy   | Docker (nginx), docker-compose |

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
│   ├── lib/image.ts            # image picker + downscale → data URL / Storage upload
│   ├── lib/supabase.ts         # Supabase client singleton
│   ├── storage/                # pluggable persistence + key migration
│   └── components/
│       ├── Editor.tsx, Toolbar.tsx
│       ├── Dialog.tsx          # in-app confirm/prompt/choose (no window.*)
│       ├── SettingsPanel.tsx, PageTree.tsx
│       ├── SubpageLink.ts, ResizableImage.tsx, DatabaseEmbed.tsx
│       ├── editor/             # Toggle, Columns, Tabs block nodes
│       └── database/           # DatabaseBlock + Table/Gallery/Timeline views
├── supabase/                   # SQL migration + `proxy` Edge Function
├── docs/supabase-setup.md      # step-by-step Supabase setup
├── Dockerfile, nginx.conf, docker-compose.yml
└── AGENTS.md                   # architecture brief for contributors
```

---

## License

[MIT](LICENSE) © Fergus
