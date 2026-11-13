# cortex — context for AI assistants / new contributors

Cortex v2 is a suite of self-hostable personal apps (modules: Notes, Finance,
Watchlist, Recipes, Health, Outfits…) built as **one modular monolith**: one
repo, one Docker image, one database. Home dashboards pull widgets from every
module. Full brief: **[docs/v2-architecture.md](docs/v2-architecture.md)**.
Self-hosting: [docs/self-hosting.md](docs/self-hosting.md).

`legacy/` is Cortex v0 (the Supabase SPA), kept as the source to port from.
It is not a workspace, and it gets deleted when `v2` merges to `main`. The tag
`v0.1.0` marks the last v0 commit.

## ⚠️ Gotchas that will bite you

- **One container, two databases.** SQLite (default, `DATA_DIR/cortex.db`) or
  Postgres (`DATABASE_URL`, hosted). Every migration and query must run on
  **both**: portable types only (`text`, `bigint`, `integer`, `real`), no
  jsonb/arrays/enums, upserts via Kysely `onConflict`. Migrations are Kysely,
  keyed `<module>_NNNN_name`. Never edit a shipped one.
- **Kysely 0.29: migrations come from `kysely/migration`**, not `kysely`.
- **Per-user data, no RLS.** Every user-data table has `user_id`. Module code
  reaches it through `forUser(db, userId)` (`packages/core/src/server`). Never
  trust a `user_id` from the client; take it from `c.get("userId")`.
- **Auth is Better Auth** (`apps/server/src/auth.ts`). The first sign-up
  becomes admin, then sign-up is closed unless `ALLOW_SIGNUP=true`. Admins add
  people in Settings → Users (admin plugin). **DO NOT** add an open sign-up
  path. `/api/*` other than `/api/auth/*`, `/api/instance` and `/api/health`
  requires a session.
- **Module contract.** Web: `CortexModule` (`packages/core/src/module.ts`),
  registered in `apps/web/src/modules.tsx`. Server: `CortexServerModule`,
  registered in `apps/server/src/modules.ts`. A new module also needs its
  `package.json` COPY line in the `Dockerfile`. A module's `Provider` wraps the
  whole signed-in app (state survives switching apps; other modules can read
  it). Its `settings` sections appear in Settings at `/settings/<module>/<id>`.
  Heavy views should be `React.lazy` (Notes does this) so Home stays light.
- **Workspaces ship TS source.** Packages export `./src/*.ts` directly. Vite
  and esbuild compile them, so there are no per-package builds. The server is
  bundled to one file (`apps/server/build.mjs`). Only `better-sqlite3` stays
  external (prebuilt N-API binaries, musl included).
- **Theme adaptability.** UI uses only `@cortex/ui` components and CSS
  variables. Themes are JSON (`themeSchema`); values are regex-whitelisted
  before they become CSS variables. Spacing is customisable only via
  `data-density`.
- **Design system, not TUI.** v2 follows the Cortex design system
  (claude.ai/artifact/8MUshKhghQFAYpMYGC1nrq): machined 2/4px radii by default
  (themes can choose `square`), mono uppercase labels, one accent colour, no
  shadows or glows. v0's "monospace everywhere, radius 0" rule no longer
  applies.
- **Settings save guard.** `useSettings().update` is a no-op until the
  settings query has loaded. Keep that guard on any new persisted state: saving
  defaults over unloaded data destroys it.
- **Native dialogs forbidden.** Use `useDialog()` (`confirm`, `prompt`,
  `choose`) from `@cortex/core`.
- **No secure-context-only APIs.** Cortex is often served over plain http on a
  LAN. Use `newId()` from `@cortex/core`, not `crypto.randomUUID`. Feature-detect
  `navigator.clipboard`.
- **Uploads are same-origin.** `/api/files/:id` sends a sandbox CSP and
  `nosniff`, and serves only images, video and PDF inline. Keep it that way.
- **The API proxy is an SSRF surface.** `/api/proxy` reaches any URL a
  connection names. `PROXY_PRIVATE_NETWORKS=deny` (the default when
  `ALLOW_SIGNUP=true`) blocks private addresses inside the socket's `lookup`.
  Never switch it to `fetch()` or a pre-check DNS lookup: both reopen DNS
  rebinding. Tokens are write-only (AES-GCM with `CORTEX_SECRET`). Changing
  that secret makes stored tokens unreadable. Module servers that fetch a
  URL a person typed (the Plex import) or a public API (exchange rates) use
  `ctx.outbound`, which goes through the same guard. Never `fetch()` those.
- **Widgets.** Modules contribute `WidgetDef`s (`CortexModule.widgets`).
  Widgets get `{ widget, dash, editing }` and change the dashboard only through
  `dash.patchWidget` / `dash.setWidgets`, never another module's store. Lazy
  widget components are fine (Suspense in `WidgetFrame`). Keep v0 type ids
  unchanged; namespace new ones (`finance.x`).
- **Keep the main bundle small.** Import colours from `@cortex/icons/colors`
  and render icons via `@cortex/icons/lazy` outside lazy chunks. A plain
  `@cortex/icons` import pulls the ~1 MB catalogue into the main bundle.
  Notes views and widgets are separate lazy chunks.
- **Finance money is integer minor units** (`bigint`). Never store floats. Use
  `parseMoney` / `formatMoney` (`modules/finance/shared/money.ts`), which take
  currency digits into account (JPY 0, BHD 3). Wrap anything read from SQL in
  `num()`, because Postgres returns bigint and SUM as strings.
- **Finance transfers** share a `transfer_id` on both halves and are left out
  of income, spending and budgets. Imports never link silently:
  `server/transfers.ts` suggests pairs (same currency: opposite amounts within
  3 days; exchanges: same day and "exchang" wording) for review, and rejected
  pairs live in `finance_transfer_ignores`. Multi-currency totals convert at
  today's ECB rates (`/finance/rates`, `convertMinor`); budgets stay in the
  base currency.
- **Finance CSV import** logic lives in `web/csv.ts` (parsing, presets,
  column roles, `applyMapping`), separate from the UI. Rows dedupe on
  `(account, external_id)`, and the hash scheme must stay stable or
  re-imports duplicate rows. The Balance column sets the opening balance so
  Cortex matches the bank. Test with real exports, not only the fake fixture.
- **Charts follow the dataviz rules**: single series in `--data-1`, the
  highlighted period in `--data-2`, bars at most 24px with a 4px rounded end,
  a tooltip per mark, and a table as the accessible view. Never a dual axis.
- **Module prefs** live in `UserSettings.modules[id]`; use `useModulePrefs`.
- **Watchlist ↔ TMDB**: only the server talks to TMDB (`modules/watchlist/server/tmdb.ts`,
  cached and mapped). Never put the key in the browser or call TMDB from web
  code. Images come from `config.imageBase`. Test against the fake TMDB via
  `TMDB_API_BASE` / `TMDB_IMAGE_BASE`. TMDB's terms require the attribution
  shown on the setup screen; keep it. Poster cards file a title in one click
  (status buttons). Discover's skips persist in `watchlist_dismissed`. The
  Plex import (`server/plex.ts`) never stores the token and skips events
  already logged.
- **Router**: `useRouter()` gives `path` and `search`. Keep shareable filters
  in the query string and `navigate(url, { replace: true })` as they change.
- **Backup.** Every module with data declares `CortexModule.backup`
  (`useBackup`, `fromV0`, `describe`). The shell's Settings → Backup builds
  one v2 file across modules and imports v0/v2 files.
- **npm.** Install with `npm install --cache /tmp/cortex-npm-cache`. Pin exact
  versions that are at least two weeks old (`--before=<date>`).

### Notes (`modules/notes`)

- **"Lists" in the UI, `database` in code.** People see Notes databases as
  *lists*; types, store methods, tables, routes, widget ids and the backup
  format keep `database` / `db` so existing data and v0 imports keep working.
  Write "list" in any new copy. The checklist widget is labelled "Checklist".

- **Ported from v0, styled by a variable bridge.** `notes.css` is the v0
  stylesheet trimmed to Notes. `@cortex/ui/compat.css` maps v0 variables
  (`--bg`, `--fg`, `--line`…) onto design-system tokens (shared with Home), and
  `@cortex/ui/tree.css` holds the sidebar-tree styles. Inside Notes v0's
  decorative `--accent` maps to ink. The design-system skin for database
  chrome sits at the end as overrides. Class names are global (only Notes uses
  them). New modules use `cx-*` and must not add to this file.
- **The button reset is `:where(...)`** (zero specificity) so single-class v0
  rules win. Don't raise its specificity.
- **The slash menu is plain DOM on `<body>`**, outside `.notes-root`, so it
  styles itself fully.
- **The URL is the selection.** Paths are name-based (`/notes/page/<ancestors>/<slug>`),
  so a rename makes the current path stale. `LastSelection` (`selection.ts`)
  keeps the item and the page rewrites the URL with `replace`.
- **Images live in `data-src`** in page HTML (`ResizableImage`). Tiptap
  serialises with the live document, so a real `src` makes the browser fetch
  the raw `cortex-file:` ref on every save. Old `src` content still parses.
- **Saves are blocked until the load succeeds**, and a failed load leaves the
  store unloaded (`loadError`), never empty-and-saveable.
- **Backups** go through Settings → Backup (`web/backup.ts` is Notes' hook).
- **Tiptap pinned at `2.27.2`** (`@tiptap/core` resolves to 2.27.3, a v2
  patch). Never v3; React stays on 18 for it. `npm audit` reports
  GHSA-cp6q-959q-f8rh (`mergeAttributes` / `__proto__`) for all of Tiptap 2.
  The fix exists only in v3. Notes only loads the signed-in person's own
  content, so the risk is accepted.
- **One stable editor instance.** Switch pages by swapping content; never
  recreate the editor.
- **NodeView embeds stop propagation** (`onMouseDown`, `onKeyDown`) on
  `<NodeViewWrapper>`. `<NodeViewContent>` adds an extra wrapper div, so CSS
  targets one level deeper.
- **Select options are `{id, name, color}`; cells store ids.** Old string
  options are migrated on load and import (`storage/migrateDatabases.ts`).
- **View config lives on the view** (filters, sort, groupBy…). Embeds store
  only the view id.
- **Computed properties** (`formula`, `created_time`, `last_edited_time`,
  `auto_id`) are read via `computedCellValue()`, never written to `row.cells`.
- **Incremental diff-save** (`diffMap` in `store.ts`) relies on strict
  immutability: unchanged entities keep object identity. It posts only changed
  and removed entities to `/api/notes/sync` (one transaction per call).

## Developer commands

```bash
npm install --cache /tmp/cortex-npm-cache
npm run dev          # server :8080 (tsx watch, data in apps/server/data) + Vite :5173 (proxies /api)
npm run typecheck    # all workspaces
npm run build        # typecheck + web bundle + server bundle
npm start            # run the built server (set WEB_DIST=apps/web/dist to serve the SPA)
docker compose up -d --build   # the one-container image on :8080
```

## Conventions

- **Atomic Commits**: Commit after each working, verified logical change.
- **Commit Footer**: Every commit message must end with this co-author block:
  ```text
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **Copy**: sentence case, terse, instrument-like ("Synced 2 min ago"). No
  exclamation marks, no emoji in UI chrome.

## Key entrypoints

- `apps/web/src/main.tsx`: providers (Query, Router, Dialog, AuthGate)
- `apps/web/src/Shell.tsx`: rail, active module, sidebar, page
- `apps/web/src/settings/`: Appearance (themes), Apps, Account, Connections, Backup, Users, plus module sections
- `apps/server/src/index.ts`: boot order (auth migrate → core/module migrate → routes → SPA)
- `packages/ui/src/theme/`: theme schema, engine, `ThemeScope`
- `packages/core/src/module.ts`, `packages/core/src/server/index.ts`: module contracts
- `modules/home/web`: `index.tsx` (Provider, sidebar, page), `store.ts`, `components/Dashboard*`, `widgets/` (generic widgets); `modules/home/server`
- `modules/watchlist`: `server/` (tmdb.ts client/cache/mappers, index.ts library/stats/upcoming), `shared/types.ts`, `web/` (views, browse, detail, library, components, settings, widgets)
- `modules/finance`: `server/index.ts` (schema, API, summaries, import, backup), `shared/` (types, money), `web/` (`views.tsx`, `pages.tsx`, `import.tsx`, `widgets.tsx`)
- `apps/server/src/connections.ts`: connections + the guarded proxy
- `apps/web/src/settings/BackupSettings.tsx`, `ConnectionsSettings.tsx`
- `modules/notes/web/index.tsx` (Provider + lazy views), `views.tsx`, `store.ts`; `modules/notes/server` (tables + `/api/notes`)
