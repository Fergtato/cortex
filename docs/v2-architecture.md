# Cortex v2 architecture

Cortex is a suite of personal apps (modules) in **one** codebase, **one**
deployable image and **one** database: a modular monolith. Home dashboards
bring the modules together. This doc covers the contracts that keep modules
independent.

```
apps/web/        SPA shell: rail, routing, auth screens, Settings, theme applier
apps/server/     Hono API: auth (Better Auth), files, settings, jobs, module routers; serves the SPA
packages/ui/     design-system components + tokens + theme engine + built-in themes
packages/core/   module/widget/backup contracts, router, API client, useDialog, StoredImg/pickImage,
                 settings hook, connections client + proxyFetch, widget registry, backup file helpers
packages/icons/  the full Lucide icon set + picker (lazy entry: @cortex/icons/lazy; colours: /colors)
modules/<id>/    web/ (Page, Sidebar, widgets) · server/ (routes, migrations, jobs) · shared/
legacy/          Cortex v0 (Supabase SPA), kept as reference while porting. Deleted at merge.
```

## Adding a module

1. `modules/<id>/package.json` named `@cortex/module-<id>`, exporting `./web`
   and, if it has a backend, `./server`.
2. **Web:** export a `CortexModule` (`packages/core/src/module.ts`): `id`,
   `name`, `icon`, `Page`, optional `Sidebar` and `widgets`. Add it to
   `apps/web/src/modules.ts`. The page renders inside `<PageFrame>` and routes
   its own sub-paths from `subpath` (`/<id>/…`).
3. **Server:** export a `CortexServerModule`
   (`packages/core/src/server/index.ts`): `migrations`, `routes`, `jobs`. Add
   it to `apps/server/src/modules.ts`. Routes mount at `/api/<id>` behind auth,
   with `c.get("userId")` set.
4. Add the package to `apps/web` (and `apps/server`) dependencies, then add its
   `package.json` COPY line to the `Dockerfile`.

## Data rules

- **Every user-data table has `user_id`.** Read and write it through
  `forUser(db, userId)`. That helper is the stand-in for Postgres RLS: module
  code never writes `where user_id = ?` by hand.
- **Portable SQL only.** Migrations and queries must run on SQLite (self-host)
  **and** Postgres (hosted). Use these types: `text` for ids, ISO timestamps
  and JSON; `bigint` for money in minor units; `integer` for 0/1 booleans;
  `real`. Avoid jsonb, arrays, enums, and dialect-only functions. Upserts use
  Kysely's `onConflict`, which works on both.
- **Migrations are namespaced.** Keys like `0001_init` become
  `<module>_0001_init`. Never edit a shipped migration; add a new one.
- **Typed tables for module data.** Use typed tables like
  `finance_transactions` so Home can aggregate in SQL. Notes keeps its
  entity-JSON tables (one row per page/database/dashboard, `data` as JSON
  text) and its incremental diff-save.
- **Connector-ready.** Tables that external data can fill carry
  `source text` + `external_id text`, with a unique index on
  `(user_id, source, external_id)` for idempotent upserts.
- **Files:** `uploadFile()` returns `cortex-file:<id>`. Render with
  `<StoredImg>`. The server checks ownership and serves uploads with a sandbox
  CSP.
- **Cross-module links:** use the `links` table (`src_module/src_id` →
  `dst_module/dst_id`), not foreign keys between modules.

## Shared server pieces

`entityTable(name)` + `entityRoutes(ctx, { key: table })`
(`@cortex/core/server`) give a module the "one JSON row per client entity"
storage with `GET /` and a transactional `POST /sync`. Notes and Home both use
it.

## Notes (the first full module)

- **Web** (`modules/notes/web`): `index.tsx` holds the eager part: the
  `Provider` (the store, loaded once per session) and the module definition.
  `views.tsx` (sidebar, pages, databases, the Tiptap editor and the full icon
  set) is lazy-loaded on first visit.
- **Store** (`store.ts`): immutable maps of pages and databases. A debounced
  diff against the last saved snapshot posts only changed and removed entities.
- **Server** (`modules/notes/server`): `notes_pages` and `notes_databases`,
  one row per entity (`(user_id, id)` key, JSON text). `GET /api/notes` loads
  everything; `POST /api/notes/sync` applies `{pages?, databases?}` deltas in
  one transaction.
- **Widgets**: database view, list, metric, habit tracker, chart, form and
  action button (`web/widgets`, one lazy chunk).
- **Backups**: through Settings → Backup (`web/backup.ts`).

## Home and widgets

- **Home** (`modules/home`) owns dashboards: `home_dashboards` entity table, a
  diff-saving store, the grid (`DashboardGrid`: fixed columns × rows,
  drag/resize, no overlaps), the widget frame and the picker. `/` shows the
  first dashboard; others live at `/home/<folder>/<name>`. On phones a
  dashboard stacks into one column in reading order.
- **Widgets come from modules** (`CortexModule.widgets`). The shell puts them
  all in a registry (`WidgetRegistryProvider` / `useWidgetDefs`). A widget gets
  `{ widget, dash, editing }`: `dash` is a `DashboardHandle` (`patchWidget`,
  `setWidgets`, the widget list), never another module's store. Widgets that
  need module data read that module's own context (Notes widgets use
  `useStoreContext`). Heavy widgets are `React.lazy`; the frame wraps them in
  Suspense, and unknown types render a placeholder.
- **Type ids**: new widgets are namespaced (`finance.balance`). Widgets ported
  from v0 keep their ids (`text`, `db-view`, `api-metric`…) so imported
  dashboards resolve.
- Widget CSS (`dw-*`) lives in `modules/home/web/home.css`, because Home is
  where widgets render.

## Connections and the proxy

`apps/server/src/connections.ts`: `connections` + `connection_secrets` (token
AES-256-GCM, key derived from `CORTEX_SECRET`). `GET/PUT/DELETE
/api/connections` (the token is write-only) and `ALL
/api/proxy/<id>/<path>`, which injects the auth recipe (bearer, header, query)
and forwards the request. Guards:
- Path containment: `..` can't leave the base URL.
- 10 s timeout and 5 MB response cap.
- Up to 3 redirects, each one re-checked.
- Sandbox CSP on the response.
- `PROXY_PRIVATE_NETWORKS=deny` (the default when `ALLOW_SIGNUP=true`)
  refuses private, loopback and link-local addresses. The check runs in the
  socket's DNS lookup, so DNS rebinding can't slip past it.

Client: `proxyFetch`, `useApiPoll`, `ConnectionSelect` in `@cortex/core`.
Settings → Connections manages them.

## Backup

Settings → Backup builds one file: `{ format: "cortex-backup", version: 2,
modules: { <id>: data } }`. Each module declares `CortexModule.backup`:
- `useBackup()` (inside its Provider) returns `summary`, `exportData` and
  `importData(data, "merge" | "replace")`.
- `fromV0(raw)` reads its part of a Cortex v0 file.
- `describe(data)` labels the import preview.

Image handling is shared (`prepareImport` in `@cortex/core`): inline data URLs
are uploaded, and v0 Supabase refs are copied after a one-off sign-in in the
browser.

## Auth

Better Auth (email + password, cookie sessions) with the admin plugin. The
first sign-up becomes admin, then sign-up closes unless `ALLOW_SIGNUP=true`.
Admins create accounts in Settings → Users. Better Auth's tables are migrated
by `migrateAuth()` at boot, before the core and module migrations.

## Themes

A theme file is JSON validated by `themeSchema` (`packages/ui/src/theme/schema.ts`):

```json
{
  "format": 1,
  "name": "Harbour",
  "mode": "dark",
  "colors": { "bg-300": "#0f1419", "accent": "#ffb454" },
  "shape": "machined",
  "fonts": "geist",
  "icons": "square",
  "density": "default"
}
```

- `colors` may be partial. Gaps fill from the built-in Dark or Light palette,
  according to `mode`. `focus` and `data-2` always follow `accent`.
- `shape`: a preset (`square` | `machined` | `soft`) or `{ "radius-xs", "radius-sm" }`.
- `fonts`: a preset (`geist` | `plex` | `system`) or `{ sans, mono, display }`.
- `density`: `compact` | `default` | `comfy`. This is the only spacing control,
  so layouts can't break.
- Values are whitelisted by regex: colours are hex or `rgb()`/`hsl()`/`oklch()`
  with numbers only, lengths are `px`/`rem`/`em`. Nothing can inject CSS.

Resolution: `resolveTheme(theme, prefs)` produces CSS variables plus `data-*`
attributes. Per-user overrides (accent, shape, font, icons, density) win over
the theme. `ThemeApplier` writes the result to `<html>` and caches it in
localStorage, and the inline script in `index.html` re-applies it before first
paint. `checkContrast` applies the design system's rules: 4.5:1 for text on
bg-000…300, and 3:1 for line-300 and accent.

Built-in themes are `packages/ui/themes/*.json`. Add a file and register it in
`BUILTIN_THEMES`.

## Connectors (planned)

Connectors run server-side as module `jobs`, or as file imports. Tokens go in a
`connection_secrets` table, encrypted with `CORTEX_SECRET`. Contract:
`{ kind, module, auth: "oauth" | "apikey" | "file", sync(conn, since) → records }`.
Records upsert by `(source, external_id)`. Build file imports first (bank
CSV/OFX, Apple Health export), then OAuth: GoCardless Bank Account Data or
TrueLayer, Plaid, Garmin, Fitbit, Oura, Withings, Strava.

## Design system

`packages/ui` is a typed port of the Cortex design system
(claude.ai/artifact/8MUshKhghQFAYpMYGC1nrq): `AppShell` structure, `AppRail`,
`Sidebar`, `TopBar`, `Grid`, `Panel`, `Stat`, `Meter`, `Button`, `Input`,
`Segmented`, `Toggle`, `Checkbox`, `Badge`, `Kbd`, `Icon`, `ThemeScope`. Fonts
are vendored via fontsource, so there are no Google Fonts calls on offline LAN
installs. Build UI from these components and the CSS variables only.
