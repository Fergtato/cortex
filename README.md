# project-tracker

A personal, Notion-lite app for tracking projects. Every project is a **page** with
a rich-text editor, and any page can have arbitrarily nested **subpages**. The whole
UI is skinned to look like a terminal TUI — monospace text, sharp 1px outlines, no
rounded corners, dark background with a green accent.

Everything runs in the browser. There is **no server and no database** — your data is
saved locally in the browser's `localStorage` (see [Architecture](#architecture)).

---

## Quick start

```bash
npm install          # if the global npm cache errors with EACCES, add: --cache /tmp/pt-npm-cache
npm run dev          # start the dev server → http://localhost:5173
npm run build        # type-check (tsc) + production build into dist/
npm run preview      # serve the production build locally
```

Requires Node 18+ (developed on Node 24).

---

## Run with Docker

Runs the frontend (nginx) and the API + SQLite backend together, with a named
volume so your data survives restarts:

```bash
docker compose up --build
```

- App → http://localhost:8080
- API → http://localhost:3001 (SQLite stored in the `pt-data` volume)

Then in the app: **⚙ settings → data source → API (SQLite)**, URL
`http://localhost:3001`, **test connection**, **apply**.

Stop with `docker compose down` (add `-v` to also delete the data volume).
To run only the backend in Docker (and the frontend via `npm run dev`):
`docker compose up --build api`.

---

## How it works

- **Create a project** — click `[ + new project ]` in the sidebar. It becomes a
  top-level page.
- **Open a page** — click any row in the sidebar tree. It opens in the main panel
  with an editable title and a rich-text body.
- **Edit text** — the toolbar above the editor toggles bold, italic, strikethrough,
  inline code, headings (H1–H3), bullet / ordered / task lists, blockquotes, code
  blocks, and horizontal rules.
- **Add subpages** — click `+` on a sidebar row, or `+ add subpage` in the page
  header. Subpages nest infinitely deep and also appear in a list at the bottom of
  their parent page.
- **Navigate** — the breadcrumb at the top of each page links back up the tree.
- **Delete** — the `×` on a sidebar row deletes that page *and all of its descendants*
  (after a confirmation prompt).
- **Saving** — every change is written to `localStorage` automatically, debounced by
  250 ms. Reload the tab and your work is still there. Clearing browser data wipes it.

---

## Architecture

This is a **single-page application with no backend**. The "backend" is the browser:
`localStorage` is the persistence layer, and the React store is the in-memory
database. The diagram below shows where each responsibility lives.

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                      │
│                                                               │
│   ┌─────────────────────── Frontend (React) ──────────────┐  │
│   │                                                        │  │
│   │   App.tsx                                              │  │
│   │     ├── Sidebar ── PageTree (recursive)                │  │
│   │     └── Main ───── Editor ── Toolbar  (Tiptap)         │  │
│   │                                                        │  │
│   │   useStore()  ← in-memory "database" (React state)     │  │
│   └────────────────────────┬───────────────────────────────  │
│                            │  read on load / write (250ms)   │
│                            ▼                                  │
│   ┌──────────────── "Backend" (persistence) ─────────────┐   │
│   │   localStorage["project-tracker:pages:v1"]           │   │
│   │   = JSON blob of all pages                           │   │
│   └──────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

### Frontend

Built with **Vite + React + TypeScript**. Rich text is handled by **Tiptap**
(`StarterKit` + task lists + a placeholder), pinned to `2.27.2` (the last v2 release).

```
project-tracker/
├── index.html                 # Vite entry point
├── vite.config.ts             # Vite + React plugin config
├── tsconfig.json              # TypeScript compiler options
├── package.json               # deps + scripts
└── src/
    ├── main.tsx               # React root; mounts <App>
    ├── App.tsx                # layout: sidebar + main panel, breadcrumbs, page header
    ├── store.ts               # useStore() hook — state + localStorage persistence
    ├── types.ts               # Page / PageMap type definitions
    ├── styles.css             # all styling (the TUI look lives here)
    └── components/
        ├── PageTree.tsx       # recursive sidebar navigation tree
        ├── Editor.tsx         # Tiptap editor wrapper
        └── Toolbar.tsx        # formatting buttons for the editor
```

**Component tree**

- `App` owns the currently-selected page id and renders the two-column layout.
  - `PageTree` renders the sidebar. It's recursive: each node renders its own
    children via another `PageTree`, which is how arbitrary nesting works.
  - `Editor` wraps a Tiptap instance and reports HTML changes upward; `Toolbar`
    issues formatting commands to that editor.

### "Backend" / data layer

There is no API server. State management and persistence are both handled by the
`useStore()` hook in [src/store.ts](src/store.ts):

- **In-memory store** — all pages are held in a single flat object (`PageMap`),
  keyed by id. This acts as the app's database while it's running.
- **Tree shape** — pages aren't physically nested. Each page carries a `parentId`
  (`null` = top-level project). The tree is *derived* by filtering pages by their
  parent — `childrenOf(parentId)`. This keeps updates simple: editing or moving a
  page is a single-record change, never a deep tree rewrite.
- **Persistence** — on load, the store reads the JSON blob from
  `localStorage["project-tracker:pages:v1"]`. On every change it writes the whole
  blob back, debounced by 250 ms so fast typing doesn't thrash storage.
- **Operations exposed by the store**: `createPage`, `updatePage` (title/content),
  `deletePage` (recursively removes descendants), and the `childrenOf` / `roots`
  selectors.

**Data model** (see [src/types.ts](src/types.ts)):

```ts
interface Page {
  id: string;
  title: string;
  content: string;       // Tiptap-generated HTML for the page body
  parentId: string | null; // null = top-level project
  createdAt: number;
  updatedAt: number;
}

type PageMap = Record<string, Page>; // the entire "database"
```

---

## Notes & limitations

- Data is per-browser and per-origin. It does **not** sync across devices or
  browsers, and clearing site data deletes it. Consider exporting if it matters.
- The storage key is versioned (`:v1`) so the schema can be migrated later without
  clobbering old data.

### Turning this into a real client/server app

Because all reads and writes funnel through `useStore()`, swapping the persistence
layer is localized. To add a real backend, replace the `loadPages` / `savePages`
functions (and the create/update/delete calls) in [src/store.ts](src/store.ts) with
`fetch` calls to a REST or GraphQL API. The `Page` / `PageMap` types can be reused
as the wire format, and the rest of the UI wouldn't need to change.
