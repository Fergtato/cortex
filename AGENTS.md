# cortex — context for AI assistants / new contributors

Compact architectural brief and gotchas for Cortex (terminal TUI-styled personal Notion-lite workspace).

## ⚠️ Gotchas that will bite you

- **Tiptap Version Pinning**: `@tiptap/*` dependencies are strictly pinned to `2.27.2` (the last v2 release). **DO NOT** let npm upgrade to v3 (contains breaking changes).
- **npm Cache Permissions**: On this machine, npm global cache has root-owned files. Always install with:
  `npm install --cache /tmp/cortex-npm-cache`
- **Native Dialogs Forbidden**: **DO NOT** use native `window.confirm/prompt/alert`. They freeze the browser/break when disabled. Always use the custom in-app `useDialog()` hook (`confirm`, `prompt`, `choose`) from `src/components/Dialog.tsx`.
- **Tiptap NodeView Wrapper Div Nesting**: Tiptap's `<NodeViewContent>` renders an extra inner wrapper `div`. Any CSS targeting node-view children must target one level deeper (e.g., `.pt-toggle-body > * > *` instead of `> *`).
- **One Stable Editor Instance**: Only one stable Tiptap editor is created and reused (`src/components/Editor.tsx`). Switching pages swaps its content—**DO NOT** recreate the editor per page (racy under `StrictMode`, drops focus/edits).
- **ProseMirror Event Hijacking**: Custom editor embeds (like `src/components/DatabaseEmbed.tsx`) must prevent ProseMirror from stealing focus or hijacking input events by stopping propagation:
  `onMouseDown={(e) => e.stopPropagation()}` and `onKeyDown={(e) => e.stopPropagation()}` on the `<NodeViewWrapper>`.
- **Loaded Flag Persistence Guard**: The store (`src/store.ts`) loads async on mount. Debounced saves to storage adapters (`src/storage/adapters.ts`) **MUST** be guarded by the `loaded` flag. If `loaded` is false, saving is blocked to prevent overwriting real user data with empty initial states.
- **SQLite Single-Row-per-Entity, Incremental Saves**: The API server (`server/index.js`) persists pages and databases in SQLite (`server/data.db`) with one row per entity using `JSON` in a `data` column. Swapping backend data source reloads the app. The normal save path is **incremental**: the store diffs against the last-persisted snapshot and sends only changed/deleted entities via `PATCH` (`{ upserts, deletes }`), so one edit never re-writes the whole collection (important now that pages can hold base64 images). `PUT` (replace-all) is kept only for bulk import/restore. The diff relies on the store's strict immutability — unchanged entities keep object identity, so a reference comparison finds exactly what changed (`diffMap` in `src/store.ts`).
- **Theme Adaptability**: Style changes and custom components **MUST** use CSS variables from `:root` (defined in `styles.css` / modified via `useSettings()`) so themes and colors respond correctly.
- **Checkbox Cell CSS Specificity**: Checkbox input cells must be wrapped in `.cell-checkbox-wrap` to override a global CSS rule `input[type=checkbox]{margin:0}`.
- **Select Options Are Objects, Cells Store Ids**: Select/multiselect options are `{id, name, color}` (`SelectOption`); cell values store option *ids* (multiselect: `string[]`), never names. Legacy `string[]` options are migrated on load by `src/storage/migrateDatabases.ts` (idempotent, identity-preserving). When showing/sorting/exporting, resolve ids → names via `prop.options`.
- **View Config Lives on the View**: Filters, sort, `groupByPropId`, `coverFit`, `datePropId`, and `aggregations` are per-view fields on `DatabaseView`, mutated via `store.updateView`. Embeds only persist *which* view they show (`data-view-id` attr); they must not carry their own filter/sort state.
- **Computed Property Types**: `formula`, `created_time`, `last_edited_time`, and `auto_id` never write to `row.cells` — always read them through `computedCellValue()` (`src/lib/formula.ts`), which sorting, filtering, aggregation, and export already do.
- **API Auth**: When `CORTEX_TOKEN` is set on the server, every `/api/*` route except `/api/health` requires `Authorization: Bearer <token>`; the client token lives in the data-source config (`apiToken`).
- **Stray Port 3001**: Port 3001 is sometimes held by a stray local `node` process. Free it with: `lsof -ti:3001 | xargs kill`.
- **Docker Web Rebuild**: When working with Docker, the `web` container serves cached static files. Rebuild with `docker compose up -d --build` to see code changes.

## Developer Commands

```bash
# install packages with cache override
npm install --cache /tmp/cortex-npm-cache

# dev frontend (http://localhost:5173)
npm run dev

# type-check & build frontend
npm run build

# start SQLite backend (http://localhost:3001)
cd server && npm install --cache /tmp/cortex-npm-cache && npm start

# docker stack (frontend :8080, API :3001)
docker compose up -d --build
```

## Conventions

- **Atomic Commits**: Commit after each working, verified logical change.
- **Commit Footer**: Every commit message must end with this co-author block:
  ```text
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **TUI Style**: Match terminal TUI looks: monospace, sharp 1px borders, no rounded corners (`border-radius: 0`), and CSS variables for theming.

## Key Entrypoints

- `src/main.tsx` — React root
- `src/App.tsx` — Main layout, sidebar, Context providers
- `src/store.ts` — Frontend store and CRUD logic
- `src/types.ts` — TypeScript models
- `src/components/Editor.tsx` — Persistent editor instance
- `src/components/Dialog.tsx` — Dialog hook (`useDialog()`)
- `server/index.js` — SQLite database and Express API
