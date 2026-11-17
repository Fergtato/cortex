<div align="center">

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/banner-light.webp">
  <img alt="Cortex: your notes, money, movies, recipes and dashboards, in one calm app you run yourself. Bring your own AI." src="docs/images/banner-dark.webp" width="100%">
</picture>

<br>

[![Build](https://img.shields.io/github/actions/workflow/status/Fergtato/cortex/docker.yml?branch=main&style=flat-square&label=build&labelColor=0a0a0b&color=2fd9b4)](https://github.com/Fergtato/cortex/actions/workflows/docker.yml) [![Image](https://img.shields.io/badge/ghcr.io-fergtato%2Fcortex-2fd9b4?style=flat-square&labelColor=0a0a0b&logo=docker&logoColor=white)](https://github.com/Fergtato/cortex/pkgs/container/cortex) [![License](https://img.shields.io/github/license/Fergtato/cortex?style=flat-square&labelColor=0a0a0b&color=2fd9b4)](LICENSE) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-2fd9b4?style=flat-square&labelColor=0a0a0b&logo=typescript&logoColor=white)](tsconfig.base.json) [![SQLite or Postgres](https://img.shields.io/badge/SQLite%20%C2%B7%20Postgres-ready-2fd9b4?style=flat-square&labelColor=0a0a0b)](docs/self-hosting.md)

**[Quick start](#quick-start)** · **[The apps](#the-apps)** · **[AI](#bring-your-own-ai)** · **[Everywhere](#everywhere)** · **[Self-hosting](#self-hosting)** · **[How it's built](#how-its-built)** · **[Development](#development)** · **[Roadmap](#roadmap)**

</div>

---

Cortex is a **self-hosted suite of personal apps** for tracking your life:
**Notes** for pages and lists, **Finance** for money, **Watchlist** for movies
and TV, **Recipes** for cooking and meal plans, and **Home** for dashboards
that pull them all together. It runs as **one Docker container** with your
data in **one volume**. There's no cloud account, no subscription and no
tracking. Your notes, bank imports and watch history stay on your machine.

Connect **the AI you already use** (Claude, ChatGPT, Gemini, OpenRouter, or a
local model through Ollama or LM Studio) and it can write recipes, file your
payments and rewrite your notes. It's optional, and nothing is sent anywhere
until you connect one.

It's built as one modular app rather than a pile of separate services, so the
apps share one sign-in, one design system, one backup file and one set of
dashboards. Adding an app means adding a folder.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/home-light.webp">
  <img alt="The Today dashboard: clock, current balance, shows in progress, a checklist, a workout habit grid, spending and budgets" src="docs/images/home.webp" width="100%">
</picture>

## Why Cortex

- **One container, five minutes.** `docker run` with one volume, then create
  your account in the browser. SQLite by default, Postgres if you want it.
- **Apps that know about each other.** A dashboard can show your bank balance
  next to the show you're halfway through and the habit you're keeping.
- **Your data, portable.** One JSON backup covers every app. Import it into
  another Cortex, or keep it as an archive.
- **Bring your own AI, or none.** Use your own key or a model on your own
  machine. Cortex never needs an AI and never sends data to one you didn't
  connect.
- **Calm, fast, keyboard-friendly.** An instrument-like design system with one
  accent colour, short linear motion, and themes you can swap or write yourself.
- **Works on your phone.** Every screen is responsive, with a bottom app bar on
  small screens.
- **Built to be hacked on.** TypeScript end to end, a documented module
  contract, and [AGENTS.md](AGENTS.md) for contributors, human or AI.

## Quick start

```bash
docker run -d --name cortex -p 8080:8080 -v cortex-data:/data ghcr.io/fergtato/cortex:latest
```

Open **http://localhost:8080** and create an account. **The first account
becomes the admin**, and sign-up then closes. Add other people in **Settings →
Users**.

<details>
<summary><b>Docker Compose</b></summary>

```yaml
services:
  cortex:
    image: ghcr.io/fergtato/cortex:latest
    ports:
      - "8080:8080"
    volumes:
      - cortex-data:/data
    environment:
      # All optional. See docs/self-hosting.md for the full list.
      - CORTEX_URL=https://cortex.example.com   # when behind a reverse proxy / HTTPS
      - TMDB_API_KEY=                           # or paste it in Settings → Watchlist
    restart: unless-stopped

volumes:
  cortex-data:
```

</details>

**Watchlist** needs a free [TMDB](https://www.themoviedb.org/settings/api) API
key. The admin pastes it once in **Settings → Watchlist** (it's stored
encrypted) or sets `TMDB_API_KEY`. **AI features** appear once someone
connects a provider in **Settings → AI**. Everything else works with no
configuration.

## The apps

<table>
  <tr>
    <td width="50%"><a href="#home-dashboards"><img src="docs/images/thumb-home.webp" alt="Home: dashboards"></a></td>
    <td width="50%"><a href="#notes"><img src="docs/images/thumb-notes.webp" alt="Notes: pages and lists"></a></td>
  </tr>
  <tr>
    <td width="50%"><a href="#finance"><img src="docs/images/thumb-finance.webp" alt="Finance: money, all of it"></a></td>
    <td width="50%"><a href="#watchlist"><img src="docs/images/thumb-watchlist.webp" alt="Watchlist: movies and TV"></a></td>
  </tr>
  <tr>
    <td width="50%"><a href="#recipes"><img src="docs/images/thumb-recipes.webp" alt="Recipes: cook, plan, repeat"></a></td>
    <td width="50%"><a href="#bring-your-own-ai"><img src="docs/images/thumb-ai.webp" alt="Bring your own AI"></a></td>
  </tr>
</table>

### Home dashboards

Grids of widgets you arrange, from every app. Make as many dashboards as you
like, group them in folders, and switch each between **fit to screen** and
**scrolling**. On a phone they reflow into one column.

<img src="docs/images/home-life.webp" alt="The Life dashboard: training minutes and kilometres, books on the list, watch time, a 16-week habit grid, a chart of minutes by workout type, a project board and the watchlist queue" width="100%">

| From | Widgets |
| --- | --- |
| **Home** | Clock, text, timer, image, API metric and API panel (live JSON from any service through [Connections](#connections)), sci-fi telemetry |
| **Notes** | List view, checklist (simple or backed by a list), metric (count, sum or average of a column), habit tracker (a GitHub-style calendar), chart, quick-add form, action button |
| **Finance** | Balance or net worth, spending this month against budget, budgets, recent transactions, spending chart |
| **Watchlist** | Continue watching, watchlist queue, upcoming episodes, watch time |

Widgets are lazy-loaded, so a dashboard only downloads the code it shows.

### Notes

A fast, Notion-style workspace: nested **pages** with a rich-text editor, and
**lists** (databases) that you can view six ways and embed in any page.

<img src="docs/images/notes-page.webp" alt="A page in Notes: the Japan trip with bookings, checklists and sub-pages" width="100%">

- **Editor**: headings, bold/italic/strike, inline code, colours and
  highlights, bullet/numbered/task lists, quotes, code blocks, tables,
  dividers, links, images you can resize, toggles, 2–5 columns and tabs.
- **Slash menu**: type `/` to insert any block, with fuzzy filtering and
  keyboard navigation.
- **Pages**: nest them as deep as you like, reorder by dragging, add icons
  (the full Lucide set, in nine colours) and covers, and make any page **full
  width**.
- **Lists**: text, number, select and multi-select (coloured options), date,
  checkbox, URL, image, **formula**, created and edited time, and auto-ID
  properties.
  - **Views**: table, board, calendar, gallery, timeline and chart. Each view
    keeps its own filters, sort, grouping and column calculations.
  - **Formulas**: a small, safe expression language (`{Price} * {Qty}`,
    `if(…)`, `concat(…)`), computed live, sortable and filterable.
  - **Import and export** as CSV or JSON, organised in folders.

<table>
  <tr>
    <td width="50%"><img src="docs/images/notes-board.webp" alt="Reading list as a board grouped by status"></td>
    <td width="50%"><img src="docs/images/notes-calendar.webp" alt="Projects on a calendar by due date"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/notes-chart.webp" alt="Workouts as a pie chart of minutes by type"></td>
    <td width="50%"><img src="docs/images/notes-table.webp" alt="Workouts as a sorted table with column totals"></td>
  </tr>
</table>

### Finance

Accounts, budgets and spending that add up, including the awkward parts: money
moving between your own accounts, money friends owe you, and more than one
currency.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/finance-light.webp">
  <img alt="Finance overview: net worth with its value in yen and the IOUs it includes, money in, spending against last month, holdings by currency, a six-month spending chart, budgets and recent transactions" src="docs/images/finance.webp" width="100%">
</picture>

- **Accounts** of every kind (current, savings, credit card, cash, investment,
  loan) in any currency. Money is stored as integer minor units, so totals are
  exact and yen, euros and dinars all round correctly.
- **Transactions** with categories, notes, search and filters. **Rules** file
  payees automatically ("Tesco" → Groceries) when you add or import them.
- **Budgets** per category, for every month or one month, with a running
  "left to spend".
- **Transfers between your accounts** don't count as income or spending.
  Cortex **spots likely pairs for you**, such as the same amount leaving one
  account and arriving in another within a few days, or a currency exchange,
  and asks you to confirm.
- **IOUs**: track who owes you and who you owe, by person. Outstanding IOUs
  count towards net worth, and repayments aren't counted as income.
- **Multiple currencies**: pick your main currency. Every total converts at
  today's ECB rates, with your other currencies shown alongside ("£24,473 ≈
  ¥5,180,863").

<table>
  <tr>
    <td width="50%"><img src="docs/images/finance-ious.webp" alt="IOUs: owed to you, you owe, net, by person and outstanding"></td>
    <td width="50%"><img src="docs/images/finance-budgets.webp" alt="Budgets by category group with progress meters"></td>
  </tr>
</table>

#### Bank CSV import

Import a statement from any bank. Cortex shows **your file as it is**, with a
picker above each column for what it holds, then **exactly what will be
imported**: new rows, rows already in Cortex, and skipped rows with the reason.
Nothing is written until you press Import.

<img src="docs/images/finance-import.webp" alt="CSV import: the raw file with a role picker above each column, settings, and a preview of new, existing and skipped rows" width="100%">

- **Recognises Revolut** account statements and savings-fund exports. One file
  can feed several accounts (Current, Savings…). Fees are subtracted and
  reverted payments skipped.
- **Balance column**: Cortex sets each account's balance to match the bank's
  latest figure, even with pending payments after it.
- **Never imports a row twice.** Re-import the same file, or an overlapping
  one, safely.
- **Dates and numbers** in any common format, including decimal commas,
  separate money-in and money-out columns, and flipped signs.
- **Hundreds of tiny daily rows**, such as savings interest, tax and fees, can
  be combined into one row per month.

### Watchlist

Movies and TV from [TMDB](https://www.themoviedb.org), tracked episode by
episode.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/watchlist-light.webp">
  <img alt="Watchlist home: a trending hero, shows in progress with episode progress bars, recommendations and popular titles" src="docs/images/watchlist.webp" width="100%">
</picture>

- **One-click filing**: hover a poster for Watchlist, Watching and Watched
  buttons, plus a menu for your own lists.
- **Quick peek**: click a poster for the basics, status buttons and the
  trailer, without leaving the page.
- **Discover**: one title at a time. Skip it or file it with the buttons, the
  arrow keys, or by dragging the poster. Skipped titles don't come back.
- **TV tracking**: tick episodes one by one or a season at a time. Cortex
  offers to mark the earlier episodes you missed. Status follows along:
  watching, caught up (waiting for the next season), finished, or **Stopped**
  for shows you've given up on.
- **Stats**: hours watched this week, over six months, this year and all time,
  a 12-month chart, top genres and recent activity, for TV and movies
  separately.
- **Search that forgives typos**: live results as you type. Misspellings and
  missing spaces still find the title ("bladrunner" → Blade Runner).
- **Library** with shelves for Movies, TV and Anime, sortable seven ways,
  custom lists, and upcoming episodes for the shows you follow.
- **Import from Plex**: sign in with your Plex account (or give a server
  address) to bring in everything you've watched, including on a friend's
  shared server. Your Plex token is never stored.

<table>
  <tr>
    <td width="50%"><img src="docs/images/watchlist-detail.webp" alt="A show's page: backdrop, poster, status, rating, trailer and episode progress"></td>
    <td width="50%"><img src="docs/images/watchlist-peek.webp" alt="Quick peek window over the home page"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/watchlist-discover.webp" alt="Discover: one poster at a time with skip and add buttons"></td>
    <td width="50%"><img src="docs/images/watchlist-stats.webp" alt="Stats: hours watched, a 12-month chart, top genres"></td>
  </tr>
</table>

### Recipes

A cookbook laid out like a meal-kit recipe card, with a cooking timeline that
tells you when to start each step.

<img src="docs/images/recipes-card.webp" alt="A recipe: a banner with the title and tags, the ingredients as a tick-box list beside prep and total time, the intro tip and the method as numbered steps" width="100%">

- **The recipe page.** The picture is a banner across the top. Ingredients
  sit in a column beside the method and stay in view as you scroll, with tick
  boxes so you can check off what you've got. Change the servings and every
  amount scales.
- **Steps as numbered blocks**, with a time, an optional photo and the
  ingredient names picked out in bold.
- **Timeline view.** Mark steps as hands-off (the oven, a simmer) or have a
  step wait for an earlier one. Cortex lays the method out as a Gantt chart,
  and if you say when you want to eat, every step gets a clock time.
- **Cook mode.** One step at a time in large type, full screen. It shows the
  ingredients each step needs and has timers that keep running between steps
  and chime when they're done. The screen stays awake where the browser
  allows it. Swipe or use the arrow keys.
- **Import from a link.** Paste a recipe URL from almost any recipe site.
  Cortex reads the recipe data the page carries (ingredients, steps, times,
  servings, photo) and opens it in the editor to check before saving.
- **Create with AI.** Describe what you fancy ("quick and vegetarian with
  leeks, feta and eggs") and your AI writes the whole recipe, timed steps
  included.
- **Tags**: built-in ones like *Under 30 mins* or *Vegetarian*, plus your
  own. Filter by several tags at once, or by ingredients you already have.
- **A week plan** (Monday to Sunday) on the Recipes home page. Drag meals
  between days, or add a note like *Eating out*. Below it: favourites, quick
  dinners, recipes you haven't made in a while, and shelves for your
  most-used tags.
- Photos of any shape are fitted to each place they appear, and you can pick
  which part stays in view. `scripts/seed-recipes.mjs` adds 24 starter
  recipes to an account.

<table>
  <tr>
    <td width="50%"><img src="docs/images/recipes-timeline.webp" alt="Timeline view: a Gantt chart of the steps with clock times for a 19:00 dinner, and a what-to-do-when list"></td>
    <td width="50%"><img src="docs/images/recipes-cook.webp" alt="Cook mode: step 2 in large type, the ingredients it uses, the full ingredient list, and a running timer"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/recipes-home.webp" alt="Recipes home: the week plan, then favourites and quick dinners"></td>
    <td width="50%"><img src="docs/images/recipes-steps.webp" alt="The method as numbered step blocks with times and hands-off markers"></td>
  </tr>
</table>

## Bring your own AI

Cortex doesn't come with an AI or an AI bill. Connect the one you already use
in **Settings → AI**:

| Provider | What you need |
| --- | --- |
| **Claude** | An Anthropic API key |
| **ChatGPT** | An OpenAI API key |
| **Gemini** | A Google AI Studio key |
| **OpenRouter** | One key for hundreds of models |
| **Ollama** / **LM Studio** | Nothing: models running on your own machine |
| **Anything OpenAI-compatible** | Its address, and a key if it needs one |

Pick a model from the provider's list, press **Test**, and save. Keys are
stored encrypted on your server and never sent back to the browser. Every
person on a Cortex server connects their own, and the admin can share one
connection for everyone who hasn't.

<img src="docs/images/ai-notes.webp" alt="Notes: a sentence selected on the Japan trip page, and the AI's improved version in a preview panel with Replace, Insert below, Try again and Discard" width="100%">

What it does today:

- **Notes: rewrite or write.** Select text and press **Ask AI** to improve it,
  fix spelling, shorten, expand, change the tone, summarise or translate, or
  type your own instruction. Type `/ai` to have it write at the cursor: a
  summary of the page, a brainstorm, a to-do list. The answer streams into a
  preview, and nothing changes in your page until you press Replace or Insert.
- **Recipes: create from an idea.** It writes ingredients, timed steps and
  hands-off markers, so the timeline works straight away, and reuses your
  tags. You check the draft in the editor before it's saved.
- **Finance: suggest categories.** Uncategorised payments are grouped by
  payee and the AI suggests a category for each. Only payee names, money in
  or out, and your category list are sent. You review the list, and **Make a
  rule** files that payee automatically next time, without asking the AI
  again.

<table>
  <tr>
    <td width="50%"><img src="docs/images/ai-recipe-dialog.webp" alt="Create a recipe with AI: an idea box with example prompts and a servings field"></td>
    <td width="50%"><img src="docs/images/ai-finance.webp" alt="Suggest categories with AI: payees with a suggested category, a Make a rule tick and Apply buttons"></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/settings-ai.webp" alt="Settings → AI: the connection in use, your connections and ones shared by the admin, and provider cards"></td>
    <td width="50%"><img src="docs/images/ai-recipe.webp" alt="The AI-written recipe open in the editor, marked Written by AI from your idea"></td>
  </tr>
</table>

Running Cortex in Docker and a model on the same computer? Inside the
container, `localhost` is the container itself, so point Cortex at your
computer's LAN IP or `host.docker.internal` (for Ollama,
`http://192.168.1.20:11434/v1`).

## Everywhere

### Themes

Dark, Light, Graphite and Paper are built in. Override the **accent**,
**shape** (square, machined, soft corners), **font**, **icon style** and
**density**, or upload a whole theme as a JSON file. Cortex checks text and
edge contrast against WCAG and tells you if a combination fails.

<img src="docs/images/settings-themes.webp" alt="Appearance settings: four themes, accent, shape, font, icon and density controls, and a contrast check" width="100%">

<details>
<summary><b>Theme file format</b></summary>

```json
{
  "format": 1,
  "name": "Harbour",
  "mode": "dark",
  "colors": { "bg-000": "#05070a", "ink-100": "#e8edf2", "accent": "#5ab0ff" },
  "shape": "machined",
  "fonts": "geist",
  "density": "default"
}
```

Every key but `name` is optional. Missing colours come from the built-in Dark
or Light palette. **Settings → Appearance → Download current** gives you a
complete starting point.

</details>

### On your phone

<img src="docs/images/phones.webp" alt="Cortex on a phone: dashboard, watchlist, finance overview, a list as a board, and a recipe" width="100%">

### Connections

Point a dashboard widget at any JSON API, such as Home Assistant, Homey, a
Docker socket proxy or your own scripts. Cortex calls it **from the server**,
so tokens never reach the browser. Tokens are stored encrypted with
`CORTEX_SECRET`. Hosted instances can block private-network addresses so
nobody can probe your LAN.

### Backup and restore

**Settings → Backup** downloads one file covering every app: pages, lists,
dashboards, accounts, transactions, budgets, rules, IOUs, watch history,
lists, recipes and meal plans. Import it in **merge** or **replace** mode. Backups from Cortex v0 (the
older single-app version) import too, images included.

### Little things

- Reorder the app rail by dragging apps in **Settings → Apps**, or switch
  apps off.
- Switching apps returns you to where you were. Going back restores the list
  and scroll position you left.
- Breadcrumbs are links. Filters live in the address, so views can be
  bookmarked and shared.
- Numbers count up, titles type out, and panels arrive in sequence. All of it
  is short, and all of it switches off if your system asks for reduced motion.
- Works over plain HTTP on a LAN: no secure-context-only browser APIs.

## Self-hosting

Everything lives in the `/data` volume: the SQLite database, uploaded files,
and the generated secret. **Back up that volume**, or use the in-app backup.

| Variable | Default | What it does |
| --- | --- | --- |
| `CORTEX_URL` | unset | Public address when behind a reverse proxy or on HTTPS |
| `CORTEX_SECRET` | generated | Signs sessions and encrypts stored tokens. Kept in `/data/secret` if unset. **Back it up** |
| `DATABASE_URL` | SQLite | A Postgres connection string, for larger or hosted installs |
| `ALLOW_SIGNUP` | `false` | `true` lets anyone create an account (hosted mode) |
| `TMDB_API_KEY` | unset | Watchlist's TMDB key (or set it in the app) |
| `TMDB_REGION` | `GB` | Region for "In cinemas" and "Upcoming" |
| `FX_RATES_URL` | Frankfurter (ECB) | Exchange rates for multi-currency totals |
| `PROXY_PRIVATE_NETWORKS` | `allow` | `deny` blocks Connections, Plex, recipe import and AI from reaching private addresses (so no local Ollama) |
| `MAX_UPLOAD_MB` | `25` | Largest file upload |
| `PORT` | `8080` | Port inside the container |

**Updating**: `docker pull ghcr.io/fergtato/cortex:latest` and recreate the
container. Database migrations run on start, for SQLite and Postgres alike.

The full guide covers configuration, backups, TrueNAS, the TMDB key,
connecting an AI, and moving from Cortex v0:
**[docs/self-hosting.md](docs/self-hosting.md)**.

## How it's built

Cortex is a **modular monolith**: one repo, one Docker image, one database.
Each app is a module with a web half and a server half, registered in one
place. The shell gives every module a sidebar, pages, settings sections,
dashboard widgets and a slice of the backup.

```mermaid
flowchart LR
  subgraph Browser
    Shell["Shell: app rail · router · themes"]
    Mods["Module UIs: Home · Notes · Finance · Watchlist · Recipes"]
    Shell --- Mods
  end
  subgraph Container["One container"]
    API["Hono server · Better Auth"]
    Srv["Module servers: routes · migrations · jobs"]
    Guard["Guarded outbound: private-network policy"]
    API --- Srv --- Guard
    DB[("SQLite /data/cortex.db\nor Postgres")]
    Files[("/data/files")]
    Srv --- DB
    API --- Files
  end
  Mods -- "/api (session cookie)" --> API
  Guard --> TMDB["TMDB"]
  Guard --> Plex["Plex"]
  Guard --> ECB["ECB rates"]
  Guard --> Yours["Your APIs (Connections)"]
  Guard --> AI["Your AI: Claude · OpenAI · Gemini · OpenRouter · Ollama"]
  Guard --> Sites["Recipe sites (link import)"]
```

| Layer | Stack |
| --- | --- |
| Web | React 18, Vite 6, TanStack Query 5, Tiptap 2 (editor), Lucide icons, a hand-built design system (`@cortex/ui`) with themeable CSS variables |
| Server | Node 24, Hono 4, Better Auth, Zod, bundled to one file with esbuild |
| Data | Kysely 0.29 over SQLite (better-sqlite3) or Postgres (pg). One set of portable migrations for both |
| Packaging | npm workspaces (`apps/`, `packages/`, `modules/`), one multi-stage Alpine image, published to GHCR by GitHub Actions |

A few rules keep it portable and safe:
- **Every table has `user_id`.** Module code can only reach data through a
  per-user query helper.
- **Money is integer minor units**, never floats.
- **Only the server talks to third parties**, AI providers included. Keys and
  tokens never reach the browser, and outbound requests go through the private-network guard, which
  is enforced at the socket so DNS rebinding can't get round it.

More detail is in **[docs/v2-architecture.md](docs/v2-architecture.md)**, and
the rules for working on the code are in **[AGENTS.md](AGENTS.md)**.

## Development

```bash
git clone https://github.com/Fergtato/cortex && cd cortex
npm install
npm run dev          # API on :8080 (data in apps/server/data) + web on http://localhost:5173
npm run typecheck    # every workspace
npm run build        # typecheck, then bundle web + server
npm start            # run the built server (WEB_DIST=apps/web/dist serves the SPA)
```

Want something to look at straight away? Create an account, then fill it with
the demo data used for these screenshots. The Watchlist part needs a TMDB key:

```bash
node scripts/seed-demo.mjs http://localhost:8080 you@example.com your-password
node scripts/seed-recipes.mjs http://localhost:8080 you@example.com your-password   # just the 24 starter recipes
```

```text
apps/web          the shell: rail, router, auth screens, settings
apps/server       Hono server: auth, migrations, files, connections, module routes
packages/ui       design system: components, tokens, themes, charts, motion
packages/core     module contract, router, API client, dialogs, backup helpers
packages/icons    Lucide catalogue + picker (lazy-loaded)
modules/home      dashboards and generic widgets
modules/notes     pages, lists, editor, Notes widgets
modules/finance   accounts, transactions, transfers, IOUs, CSV import
modules/watchlist TMDB client, library, stats, Discover, Plex import
modules/recipes   recipes, timeline, cook mode, week plan, link import
```

**Adding an app** means a folder in `modules/` with a `CortexModule` (web) and
a `CortexServerModule` (server), one registry line each, and a line in the
Dockerfile. [docs/v2-architecture.md](docs/v2-architecture.md) walks through
it.

## Roadmap

- [x] Shell, accounts, themes, backups, Connections
- [x] Notes, Home dashboards, Finance, Watchlist
- [x] Bank CSV import, transfers, IOUs, multiple currencies
- [x] Plex import, Discover, stats
- [x] Recipes: cookbook, cooking timeline, cook mode, week plan, link import
- [x] Bring your own AI: recipes from an idea, category suggestions, rewriting in Notes
- [ ] Shopping list from the week plan
- [ ] More AI: ask questions about your money, build dashboards and lists from a description
- [ ] **Health**: workouts, sleep and weight, with Apple Health export import
- [ ] **Outfits**: a wardrobe and outfit planner
- [ ] Connectors: open-banking sync, wearables (Garmin, Oura, Fitbit, Withings)
- [ ] IMDb and TV Time importers for Watchlist
- [ ] A hosted version, from the same image

## Credits

- Film and TV data and images from **[TMDB](https://www.themoviedb.org)**.
  *This product uses the TMDB API but is not endorsed or certified by TMDB.*
- Exchange rates from the European Central Bank, via
  **[Frankfurter](https://frankfurter.dev)**.
- Icons by **[Lucide](https://lucide.dev)**. Typefaces: **Geist**, **Geist
  Mono** and **Saira**.
- Screenshots show demo data. Posters are © their respective owners.

## License

[MIT](LICENSE) © Fergus
