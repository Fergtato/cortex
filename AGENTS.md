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
- **Supabase Single-Row-per-Entity, Incremental Saves**: In Supabase mode (`SupabaseAdapter` in `src/storage/adapters.ts`) pages, databases and dashboards live in Postgres tables `pages`/`databases`/`dashboards`, one row per entity, `(user_id, id)` primary key, entity JSON in a `jsonb data` column. `user_id` defaults to `auth.uid()` and **RLS** restricts every row to its owner — never add a client-side user filter or send `user_id`. Saves are **incremental**: the store diffs against the last-persisted snapshot and upserts only changed entities / deletes removed ones, so one edit never re-writes the whole collection. The diff relies on the store's strict immutability — unchanged entities keep object identity, so a reference comparison finds exactly what changed (`diffMap` in `src/store.ts`). Loads **must paginate** (`.range()`): PostgREST caps responses at 1000 rows. Backup import goes through `store.replaceAll`, which lets the same diff-save write the result. Schema: `supabase/migrations/0001_cortex.sql` (idempotent; the user runs it in Studio).
- **Theme Adaptability**: Style changes and custom components **MUST** use CSS variables from `:root` (defined in `styles.css` / modified via `useSettings()`) so themes and colors respond correctly.
- **Checkbox Cell CSS Specificity**: Checkbox input cells must be wrapped in `.cell-checkbox-wrap` to override a global CSS rule `input[type=checkbox]{margin:0}`.
- **Select Options Are Objects, Cells Store Ids**: Select/multiselect options are `{id, name, color}` (`SelectOption`); cell values store option *ids* (multiselect: `string[]`), never names. Legacy `string[]` options are migrated on load by `src/storage/migrateDatabases.ts` (idempotent, identity-preserving). When showing/sorting/exporting, resolve ids → names via `prop.options`.
- **View Config Lives on the View**: Filters, sort, `groupByPropId`, `coverFit`, `datePropId`, and `aggregations` are per-view fields on `DatabaseView`, mutated via `store.updateView`. Embeds only persist *which* view they show (`data-view-id` attr); they must not carry their own filter/sort state.
- **Computed Property Types**: `formula`, `created_time`, `last_edited_time`, and `auto_id` never write to `row.cells` — always read them through `computedCellValue()` (`src/lib/formula.ts`), which sorting, filtering, aggregation, and export already do.
- **URL Routing**: Selection ↔ URL lives in `src/lib/routes.ts`. Paths are name-only (`/page/<ancestors>/<slug>`, `/database/<folder>/<slug>`, `/dashboard/<folder>/<slug>`); sibling name collisions get `-2`, `-3`… in creation order, so renames/moves change the URL (rewritten via `replaceState`). Legacy `<slug>-<id>` links still resolve by id. The SPA needs an index.html fallback for deep links (Vite does this; `nginx.conf` has `try_files`).
- **Auth Is Invite-Only**: Public sign-up is disabled on the Supabase server; `src/components/AuthGate.tsx` offers only sign-in, forgot-password, and set-password (after invite/recovery links). The app — and therefore `useStore` and its adapter — mounts only once a session exists. **DO NOT** add a sign-up form; account creation happens in Studio. Only the **anon** key may ever reach the client.
- **Images Are Storage Refs in Supabase Mode**: `pickImage()` (`src/lib/image.ts`) uploads to the private `cortex-files` bucket under `<uid>/…` and returns a `cortex-file:<path>` ref (localStorage mode still returns a data URL). Any `<img>` showing stored images **MUST** use `<StoredImg>` / `useStoredSrc()` (`src/components/StoredImg.tsx`), which resolves refs to batched, cached signed URLs.
- **API Connections Proxy = Edge Function**: `src/lib/connections.ts` reads/writes the `connections` table; tokens are written only via the `set_connection_token` RPC into `connection_secrets` (no client access at all). Requests go through `supabase/functions/proxy` (deploy by copying into the self-hosted `volumes/functions/` and restarting `functions`). `unix://` sockets are not supported.
- **Docker Web Rebuild**: When working with Docker, the `web` container serves cached static files. Rebuild with `docker compose up -d --build` to see code changes.

## Developer Commands

```bash
# install packages with cache override
npm install --cache /tmp/cortex-npm-cache

# dev frontend (http://localhost:5173)
npm run dev

# type-check & build frontend
npm run build

# docker (frontend :8080; set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env to preconfigure)
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
- `src/components/AuthGate.tsx` — Supabase sign-in gate + `useAuth()`
- `src/lib/supabase.ts` — Supabase client singleton
- `supabase/` — SQL migration + `proxy` Edge Function; setup guide in `docs/supabase-setup.md`
