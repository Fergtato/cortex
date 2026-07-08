# Cortex — Import a Notion export

> Implementation plan. Approved and ready to action in a fresh session.
> Sample export used for research: `~/Downloads/notion.zip` (Notion Markdown & CSV format).

## Context

Bring an existing Notion workspace into Cortex by importing a Notion **Markdown & CSV** export.
Today Cortex only imports a single `.json`/`.csv` into one database (`src/lib/importDB.ts` +
`handleImport` in `src/App.tsx`). This adds a `.zip` import path that reconstructs the whole page
tree, converts page bodies to the editor's HTML, turns Notion databases into Cortex databases
(embedded in their parent page), and pulls in images — all landing under one wrapper page for
easy review.

**Decisions (confirmed with user):** add `fflate` + `marked`; downscale raster images & cap GIFs;
import databases from `_all.csv` and drop per-row page bodies; nest everything under one
"Imported from Notion" page.

## Notion export format (verified against the sample)

- **Nested zip.** Outer zip → `ExportBlock-…-Part-N.zip` (one or more parts). Inner zip is a tree
  rooted at a space folder (e.g. `Private & Shared/`), which is a wrapper, not a page.
- **Pages** = `<Title> <32hexid>.md`; first line is `# Title`; children live in a sibling folder of
  the same `<Title> <id>` name. Body is standard Markdown (headings, `**bold**`, nested
  bullet/numbered lists, `- [ ]` task lists, blockquotes, code, tables). Notion toggles export as a
  bullet + indented body (import as nested lists — acceptable).
- **Page links:** `[Name](relative/Path%20<id>.md)` (URL-encoded spaces).
- **Images:** `![alt](relative/Path%20<id>/file.ext)`; files stored in the page's folder. ~7.5 MB
  total in the sample (a 2.7 MB png, GIFs 0.2–1.25 MB).
- **Databases:** `<Name> <id>.csv` (current view) **and** `<Name> <id>_all.csv` (full — use this),
  plus a `<Name> <id>/` folder of per-row `.md` pages. The parent page links the DB via
  `[Name](….csv)`.
- **CSV:** first column = title; **no declared types** (infer); dates like `6 May 2024 09:49`;
  multi-select as comma-joined `"All, Daily NE"`; Yes/No columns; numbers; text. Headers may be
  quoted / trailing-space.
- **Filenames** can contain non-UTF8 bytes (smart quotes) — decode leniently.
- **Rule:** a folder paired with a sibling `<same> .csv` is a *database folder*; its direct `.md`
  children are **rows**, not subpages.

## Approach

### New dependencies
`fflate` (in-browser unzip) and `marked` (Markdown→HTML), pinned; install with
`npm install --cache /tmp/cortex-npm-cache`.

### `src/lib/notionImport.ts` — orchestrator (pure, no React)
1. **Unzip** uploaded bytes with fflate. If entries are `*.zip` (multi-part), recurse and merge into
   a flat `path → Uint8Array` map. Decode names with `TextDecoder(…, {fatal:false})`. Skip
   `__MACOSX`/dotfiles.
2. **Index & classify** each entry: page-md, database-csv (prefer `_all.csv`), row-md (`.md` inside a
   database folder → skipped), or asset (png/jpg/gif/webp). Extract the 32-hex Notion id from each
   name; compute each node's parent from its containing `<Title> <id>/` folder.
3. **Two-pass id map.** Pass 1 allocates a new Cortex id for every page and database (Notion-id →
   new-id) so links/embeds resolve in either direction.
4. **Databases** from each `_all.csv`: parse with the existing CSV parser in `src/lib/importDB.ts`,
   then run **column type inference** (new helper): date (Notion date parse) → number → checkbox
   (values ⊆ {yes,no,✓,blank}) → multiselect (commas / low-cardinality repeated vocab) → select
   (low-cardinality single) → url (`http…`) → text. Build `SelectOption[]` and map cell strings to
   option ids, reusing `normalizeOptions` + colour assignment from `src/storage/migrateDatabases.ts`.
5. **Pages** from each page-md via the markdown module below.
6. Return `{ rootIds, pages: Page[], databases: Database[], stats }` with explicit ids/parentIds.

### `src/lib/notionMarkdown.ts` — Markdown → editor HTML
- `marked.parse(md, { gfm:true })`; strip the leading `# Title` (it becomes `page.title`).
- Post-process the HTML with `DOMParser` to make it editor-native (matching the confirmed node
  formats):
  - `<img src="relative">` → resolve to the asset bytes; convert to data URL (see image handling);
    emit `<img src=dataURL data-width="420" data-aspect="original">` (**ResizableImage** format).
    Over-cap GIF → drop with an `[image too large]` note.
  - `<a href="…%20<id>.md">` whose id is an imported page → `<a data-subpage-link
    data-page-id=<newId> data-title=<title> class="subpage-link-inline">` (**SubpageLink**).
    External `http(s)` links stay plain `<a>`.
  - `<a href="…%20<id>.csv">` (DB link) → `<div data-database-embed data-db-id=<newDbId>></div>`
    (**DatabaseEmbed**), embedding the created database where the link was.
- Store the result as `page.content`; Tiptap parses the custom nodes on load.

### `src/lib/image.ts` — extend
Refactor the existing `fileToDataUrl` canvas-downscale path to share a Blob core and add
`bytesToDataUrl(bytes, mime, {maxGifBytes})`: rasters (png/jpg/webp) reuse the 1600px/JPEG
downscale; **GIFs skip the canvas** (would kill animation) and embed as-is only if ≤ cap
(default 1 MB), else return null so the caller drops it.

### `src/store.ts` — bulk import
Add `importNotion({ pages, databases, wrapperTitle })`: creates the "Imported from Notion — <date>"
wrapper page, reparents the Notion root(s) under it, and bulk-inserts the pre-built `Page`/`Database`
objects (explicit ids so two-pass links resolve) in one immutable update. Convert relative dates to
absolute in the wrapper title.

### `src/App.tsx` — UI wiring
Extend the existing hidden import `<input>` `accept` to include `.zip`; in `handleImport`, branch on
`.zip` → run `notionImport` (async, show an "importing…" state via `useDialog`), then a summary
dialog (pages / databases / images imported, images skipped). Reuse the existing "Import database"
control; relabel it to cover Notion zips.

## Critical files
- **New:** `src/lib/notionImport.ts` (orchestrator), `src/lib/notionMarkdown.ts` (md→html +
  link/image/embed rewrite).
- **Edit:** `src/lib/image.ts` (bytes→dataURL + GIF cap), `src/lib/importDB.ts` (reuse CSV parser;
  add/expose type inference), `src/store.ts` (`importNotion`), `src/App.tsx` (accept `.zip`, branch,
  summary), `package.json` (deps).
- **Reuse:** `normalizeOptions` + colour assignment (`src/storage/migrateDatabases.ts`); editor node
  HTML formats — SubpageLink (`<a data-subpage-link data-page-id data-title>`), ResizableImage
  (`<img src data-width data-aspect>`), DatabaseEmbed (`<div data-database-embed data-db-id>`);
  existing `importFromCSV` CSV parser.

## Gotchas
- Tiptap stays pinned `2.27.2`; install with the cache override. No native dialogs — use `useDialog`.
- Non-UTF8 filenames: decode leniently; the sample has one (`poor man's poison`) that must not crash
  the import.
- Storage size: downscale + cap keeps it viable on localStorage (~5 MB); warn if the result is large
  and the backend is localStorage (SQLite API allows ~20 MB).
- Multi-part exports: merge all `Part-N.zip`. Skip `__MACOSX`/dotfiles.
- Store bulk insert must keep strict immutability (identity preserved for untouched entities) so the
  debounced diff-save works.

## Verification
- **Build:** `npm run build` (tsc + vite) clean.
- **Preview (port 5199):** wire the file input, then import the sample zip and confirm:
  - An "Imported from Notion — <date>" wrapper with `Life` under it; subtree matches (Hobbies,
    Fitness, Cars, Watches, Music…).
  - `Cars` shows rich content (nested lists from toggles, bold, numbered steps).
  - `Watches`: task-list wishlist/owned + the image renders (downscaled), trailing text intact.
  - `Fitness`: the `Exercises` database is embedded where the CSV link was, imported from `_all.csv`
    with columns Name / Created (date) / Sets & Reps (text) / Tags (multiselect, coloured).
  - `Music - To Download`: Downloaded (Yes/No) inferred as checkbox/select; Artist text.
  - `Life` → child links work as subpage links; reload persists (check localStorage size, or point at
    the SQLite API for the media-heavy import).
- **Edge:** the non-UTF8 filename page imports without crashing; a second import creates a fresh
  wrapper (additive, no clobber).
