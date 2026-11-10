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
  registered in `apps/web/src/modules.ts`. Server: `CortexServerModule`,
  registered in `apps/server/src/modules.ts`. A new module also needs its
  `package.json` COPY line in the `Dockerfile`.
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
- **npm.** Install with `npm install --cache /tmp/cortex-npm-cache`. Pin exact
  versions that are at least two weeks old (`--before=<date>`).

### Notes port (Phase 2): carry over from v0

- **Tiptap pinned at `2.27.2`**. Never v3. React stays on 18 for it.
- **One stable editor instance.** Switch pages by swapping content; never
  recreate the editor.
- **NodeView embeds stop propagation** (`onMouseDown`, `onKeyDown`) on
  `<NodeViewWrapper>`. `<NodeViewContent>` adds an extra wrapper div, so CSS
  targets one level deeper.
- **Select options are `{id, name, color}`; cells store ids.** Legacy migration:
  `legacy/src/storage/migrateDatabases.ts`.
- **View config lives on the view** (filters, sort, groupBy…). Embeds store
  only the view id.
- **Computed properties** (`formula`, `created_time`, `last_edited_time`,
  `auto_id`) are read via `computedCellValue()`, never written to `row.cells`.
- **Incremental diff-save** (`diffMap` in `legacy/src/store.ts`) relies on
  strict immutability. Port it to the HTTP adapter unchanged.

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
- `apps/web/src/settings/`: Appearance (themes), Apps, Account, Users
- `apps/server/src/index.ts`: boot order (auth migrate → core/module migrate → routes → SPA)
- `packages/ui/src/theme/`: theme schema, engine, `ThemeScope`
- `packages/core/src/module.ts`, `packages/core/src/server/index.ts`: module contracts
- `modules/home`, `modules/notes`: first modules (Notes is a placeholder until Phase 2)
