# Cortex

A self-hosted suite of personal apps for tracking your life: **Notes** (pages
and databases), **Finance**, **Watchlist**, **Recipes**, **Health** and more,
with **Home** dashboards that pull them together. It runs as one container with
your data in one volume, and has themes you can swap or write yourself.

```bash
docker run -d -p 8080:8080 -v cortex-data:/data ghcr.io/fergtato/cortex:latest
```

> **v2 is in progress on the `v2` branch.** The foundation is in place: the
> shell, design system, themes, accounts and the server. The Notes features
> below are being ported from v0 (`legacy/`, tag `v0.1.0`). Finance comes next.
>
> - Self-hosting: [docs/self-hosting.md](docs/self-hosting.md)
> - Architecture and adding a module: [docs/v2-architecture.md](docs/v2-architecture.md)
> - Working on the code (human or AI): read [AGENTS.md](AGENTS.md) first

## Notes features (v0, being ported)

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
## Development

```bash
npm install --cache /tmp/cortex-npm-cache
npm run dev        # API on :8080 + web on http://localhost:5173
npm run build      # typecheck, then bundle web + server
```

Stack: React 18 + Vite, Hono, Kysely (SQLite or Postgres), Better Auth, npm
workspaces (`apps/`, `packages/`, `modules/`). See
[docs/v2-architecture.md](docs/v2-architecture.md).

## License

[MIT](LICENSE) © Fergus
