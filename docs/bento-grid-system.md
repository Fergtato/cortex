# Bento Grid Dashboard System — Implementation Spec

Reusable spec for the drag/resize bento-box grid built for Cortex's dashboards
feature. Written to be handed to a model as a self-contained brief for
reproducing the same system in a different app.

## Core concept

A fixed **columns × rows CSS Grid**. Every widget occupies a rectangular block
defined by integer cell coordinates `{x, y, w, h}` (0-indexed origin,
width/height in cells). There is no free-form pixel positioning — everything
snaps to whole cells. This is what makes it a "bento box": clean rectangular
regions of varying size tiling a fixed grid, no gaps unless deliberately left
empty, no overlaps ever.

## Data model

```ts
interface Widget {
  id: string;
  type: string;           // which widget kind
  x: number; y: number;   // top-left cell
  w: number; h: number;   // span in cells (min 1×1)
  config: Record<string, unknown>; // per-type settings
}

interface Dashboard {
  widgets: Widget[];
  columns: number;   // grid column count (e.g. default 8)
  rows: number;      // grid row count (e.g. default 6)
  rowHeight: number; // px per row, used only in "scroll" sizing mode
  sizing: "fit" | "scroll"; // fit = fills viewport, no scroll; scroll = fixed row height, grows down
}
```

## Rendering the grid

```css
.dash-grid {
  display: grid;
  height: 100%; /* only when sizing === "fit"; "auto" for scroll */
}
```

Inline styles set per-dashboard:

```js
gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`
gridTemplateRows: sizing === "fit"
  ? `repeat(${rows}, minmax(0, 1fr))`   // rows share the available height evenly
  : `repeat(${rows}, ${rowHeight}px)`   // fixed px rows, container scrolls
gap: 6 // px, GAP constant — must match the JS math below exactly
```

Each widget gets:

```js
gridColumn: `${x + 1} / span ${w}`
gridRow: `${y + 1} / span ${h}`
```

That's the entire "layout engine" — no JS positioning math for rendering, CSS
Grid does it all. All the JS work is in *editing* (translating pointer
position → cell coordinates → committed `{x,y,w,h}`).

## Widget frame (chrome around every widget)

Every widget is wrapped in a bordered box (`position: relative`, flex column,
`overflow: auto`, and critically **`container-type: size`** so inner content
can use container queries like `clamp(10px, 20cqmin, 40px)` to scale
text/icons with the cell — this is what makes widgets look right whether
they're 1×1 or 6×4). In edit mode the frame additionally renders:

- A **header bar** (drag handle, `cursor: grab`) showing an icon + label + a
  settings gear + a remove `×`.
- Three **resize handles**: a thin strip on the right edge (`ew-resize`), a
  thin strip on the bottom edge (`ns-resize`), and a small square in the
  bottom-right corner (`nwse-resize`) with a little corner-bracket glyph drawn
  via `::after`.

In view mode none of that renders — just the widget's own content filling the
frame.

## Edit mode toggle

A single boolean (`editing`) owned by the dashboard view, toggled by a
button. Everything below only activates when `editing === true`. In view mode
the grid is just widgets rendered in their cells with no interaction chrome.

## Move (drag)

1. `pointerdown` on the widget's header bar starts a drag: record
   `mode: "move"`, the widget's id, and `offX/offY` = the cell-space offset
   between the pointer's current cell and the widget's origin (so dragging
   from the middle of the widget doesn't snap its origin to the cursor).
2. A **window-level** `pointermove` listener (not on the element — so the
   drag tracks even if the pointer leaves the widget) computes the pointer's
   current cell via a `cellAt(clientX, clientY)` helper:
   ```js
   const rect = gridEl.getBoundingClientRect();
   const cellW = (rect.width - GAP*(cols-1)) / cols;
   const cellH = fit ? (rect.height - GAP*(rows-1)) / rows : rowHeight;
   col = clamp(floor((clientX - rect.left) / (cellW + GAP)), 0, cols-1);
   row = clamp(floor((clientY - rect.top + gridEl.scrollTop) / (cellH + GAP)), 0, rows-1);
   ```
3. New candidate rect = `{ x: clamp(col - offX, 0, cols - w), y: clamp(row - offY, 0, rows - h), w, h }` —
   same w/h as before, just repositioned.
4. Check for collisions against every *other* widget (AABB overlap test:
   `!(a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y)`).
5. Render a **ghost** — a semi-transparent dashed-border div placed at the
   candidate rect via the same `gridColumn`/`gridRow` trick — green/accent if
   valid, red if it would collide. The dragged widget itself dims to low
   opacity while dragging.
6. `pointerup` (also window-level): if the ghost never actually moved from
   the original rect, do nothing. If it moved and is valid, commit
   `{x,y,w,h}` to the widget. If invalid, just drop the drag state — the
   widget snaps back to its last committed position (nothing was written).

## Resize (corner/edge dragging)

Same drag-state machine, `mode: "resize"`, but parameterized by which edges
are active: `{ e: boolean, s: boolean }` (east/south — this app only grows
right/down from a fixed top-left; the corner handle sets both `e` and `s`
true, the edge handles set one).

- East drag: `w = clamp(col - x + 1, 1, cols - x)` (col is the pointer's
  current cell; width is always ≥ 1).
- South drag: `h = clamp(row - y + 1, 1, rows - y)`.
- `x`/`y` never change during a resize — only `w`/`h` grow/shrink from the
  fixed origin.

Same ghost-preview, same collision check, same commit-or-snap-back on
pointerup.

Resize handles are positioned absolutely inside the widget frame: a 6px-wide
strip on the right edge (full height), a 6px-tall strip on the bottom edge
(full width), and a 12×12px square at the bottom-right corner sitting on top
of both (`z-index` above them). `touch-action: none` on all of them so touch
drags don't scroll the page.

## Add widget

Every grid cell **not covered by any widget** is computed each render (when
editing): a simple O(rows×cols) scan checking each 1×1 cell against every
widget's rect. Each empty cell renders a `+` button (opacity 0, revealed on
`:hover`) that opens a small popover widget-picker anchored to that cell.
Picking a type inserts a widget at that cell's `{x,y}` with the widget-type's
**default size**, shrinking the default size (row by row, toward 1×1) if it
doesn't fit within the grid bounds or would collide with something.

## Remove widget

`×` in the header opens a confirm dialog; on confirm, filter the widget out
of the array.

## Grid resize controls (dashboard-level, not per-widget)

Toolbar buttons `−`/`+` next to a "8c"/"6r" label adjust `columns`/`rows` by
1. The decrement is disabled once shrinking would clip a widget — compute
`minCols = max(1, ...widgets.map(w => w.x + w.w))` and disable `−` when
`columns <= minCols` (same for rows).

## Fit vs scroll toggle

A button flips `sizing` between `"fit"` (grid fills the viewport height
exactly, rows share space evenly, no scrollbar) and `"scroll"` (rows are a
fixed pixel height, the grid's natural height can exceed the viewport, and
the *wrapping container* — not the grid itself — scrolls vertically). This is
a pure CSS switch driven by the `sizing` value; the drag/resize math also
branches on it (`cellH` is either `available height / rows` or the fixed
`rowHeight`).

## Persistence

All mutations (move, resize, add, remove, grid dimension changes, sizing
toggle) go through one function that replaces the whole `widgets` array (or
dashboard fields) immutably — no per-cell diffing needed since the grid
re-renders cheaply from `{x,y,w,h}` alone. Nothing is written to storage
*during* a drag — only on `pointerup`/commit, so intermediate ghost states
are pure local React state (`useState` + a `useRef` mirror so the
window-level listeners always see the latest drag state without stale
closures).

## Key implementation gotchas

1. **Window-level pointer listeners, not element-level** — required so a
   fast drag that leaves the widget's bounding box (or even the grid) still
   tracks correctly.
2. **A `ref` mirror of the drag state** alongside the `useState` — the
   `pointermove`/`pointerup` handlers are registered once per drag session
   (`useEffect` keyed on drag start, not on every ghost update) and read the
   mirror ref to avoid stale closures without re-subscribing listeners on
   every pixel of movement.
3. **The GAP constant must be identical** between the CSS `gap` property and
   the JS `cellAt` math, or click targeting drifts from the visual grid.
4. **Snap-back on invalid drop is "do nothing"**, not "revert visually" —
   because the widget's actual rendered position always comes from its last
   *committed* `{x,y,w,h}`, an invalid drag that never commits automatically
   renders back where it started the instant the ghost disappears.
5. **`container-type: size` on each widget's body** is what lets individual
   widgets scale their internal font sizes/icon sizes responsively via
   `cqw`/`cqh`/`cqmin` units as they're resized — without this, widget
   content doesn't adapt to being made bigger or smaller.
6. **Collision detection is a single reusable AABB overlap test**, run
   against every other widget on every pointer move during move/resize, and
   again (differently) when computing empty cells for the add-affordance and
   when auto-placing a newly added widget.
