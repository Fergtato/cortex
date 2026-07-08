import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Dashboard, Widget, WidgetType } from "../../types";
import type { Store } from "../../store";
import { useDialog } from "../Dialog";
import { WidgetFrame } from "./WidgetFrame";
import { WidgetPicker } from "./WidgetPicker";
import { WIDGET_DEFS } from "./widgets/registry";

/** Gap between grid cells, px. Must match the CSS `--dash-gap`. */
const GAP = 6;

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function collides(rect: Rect, widgets: Widget[], ignoreId: string | null): boolean {
  return widgets.some((w) => w.id !== ignoreId && overlaps(rect, w));
}

interface Drag {
  mode: "move" | "resize";
  widgetId: string;
  /** Pointer's cell offset from the widget origin (move only). */
  offX: number;
  offY: number;
  /** Which edges a resize drags. */
  edges: { e: boolean; s: boolean };
  ghost: Rect;
  valid: boolean;
  /** Whether the pointer actually moved the ghost off the original rect. */
  moved: boolean;
}

interface Props {
  dash: Dashboard;
  store: Store;
  editing: boolean;
}

/**
 * The bento grid. A fixed columns×rows CSS grid; widgets span rectangular
 * blocks. In edit mode: drag a widget's header to move it, drag its edge
 * handles to resize, click an empty cell to add, × to remove. All commits go
 * through store.updateDashboard (immutable, snap-to-cell, no overlaps).
 */
export function DashboardGrid({ dash, store, editing }: Props) {
  const dialog = useDialog();
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);

  const { columns: cols, rows, rowHeight, sizing } = dash;
  const fit = sizing === "fit";

  /** Grid cell under a pointer position, clamped to the grid. */
  const cellAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = gridRef.current!;
      const rect = el.getBoundingClientRect();
      const cellW = (rect.width - GAP * (cols - 1)) / cols;
      const cellH = fit ? (rect.height - GAP * (rows - 1)) / rows : rowHeight;
      const col = Math.floor((clientX - rect.left) / (cellW + GAP));
      const row = Math.floor((clientY - rect.top + el.scrollTop) / (cellH + GAP));
      return {
        col: Math.max(0, Math.min(col, cols - 1)),
        row: Math.max(0, Math.min(row, rows - 1)),
      };
    },
    [cols, rows, rowHeight, fit]
  );

  // Window-level pointer tracking while a drag is active. dragRef mirrors the
  // React state so the handlers always see the latest ghost.
  useEffect(() => {
    if (!drag) return;
    dragRef.current = drag;

    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const widget = dash.widgets.find((w) => w.id === d.widgetId);
      if (!widget) return;
      const { col, row } = cellAt(e.clientX, e.clientY);
      let ghost: Rect;
      if (d.mode === "move") {
        ghost = {
          x: Math.max(0, Math.min(col - d.offX, cols - widget.w)),
          y: Math.max(0, Math.min(row - d.offY, rows - widget.h)),
          w: widget.w,
          h: widget.h,
        };
      } else {
        ghost = {
          x: widget.x,
          y: widget.y,
          w: d.edges.e ? Math.max(1, Math.min(col - widget.x + 1, cols - widget.x)) : widget.w,
          h: d.edges.s ? Math.max(1, Math.min(row - widget.y + 1, rows - widget.y)) : widget.h,
        };
      }
      const moved =
        d.moved ||
        ghost.x !== widget.x ||
        ghost.y !== widget.y ||
        ghost.w !== widget.w ||
        ghost.h !== widget.h;
      const next: Drag = {
        ...d,
        ghost,
        valid: !collides(ghost, dash.widgets, d.widgetId),
        moved,
      };
      dragRef.current = next;
      setDrag(next);
    }

    function onUp() {
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (!d || !d.moved || !d.valid) return; // snap back on invalid drops
      store.updateDashboard(dash.id, (cur) => ({
        ...cur,
        widgets: cur.widgets.map((w) => (w.id === d.widgetId ? { ...w, ...d.ghost } : w)),
      }));
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // Intentionally keyed on drag "session", not every ghost update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.widgetId, drag?.mode, dash, cellAt, store]);

  function startMove(widget: Widget, e: ReactPointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    const { col, row } = cellAt(e.clientX, e.clientY);
    setDrag({
      mode: "move",
      widgetId: widget.id,
      offX: col - widget.x,
      offY: row - widget.y,
      edges: { e: false, s: false },
      ghost: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
      valid: true,
      moved: false,
    });
  }

  function startResize(widget: Widget, e: ReactPointerEvent, edges: { e: boolean; s: boolean }) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({
      mode: "resize",
      widgetId: widget.id,
      offX: 0,
      offY: 0,
      edges,
      ghost: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
      valid: true,
      moved: false,
    });
  }

  function addWidget(type: WidgetType, at: { x: number; y: number }) {
    const def = WIDGET_DEFS[type];
    // Default size clamped to the grid; shrink toward 1×1 until it fits.
    let rect: Rect = {
      x: at.x,
      y: at.y,
      w: Math.min(def.defaultSize.w, cols - at.x),
      h: Math.min(def.defaultSize.h, rows - at.y),
    };
    while (collides(rect, dash.widgets, null) && (rect.w > 1 || rect.h > 1)) {
      rect = { ...rect, w: Math.max(1, rect.w - 1), h: Math.max(1, rect.h - 1) };
    }
    if (collides(rect, dash.widgets, null)) return; // clicked cell occupied
    const widget: Widget = { id: uid(), type, ...rect, config: { ...def.defaultConfig } };
    store.updateDashboard(dash.id, (cur) => ({ ...cur, widgets: [...cur.widgets, widget] }));
  }

  async function removeWidget(widget: Widget) {
    const def = WIDGET_DEFS[widget.type];
    const ok = await dialog.confirm(`Remove this ${def.label} widget?`, {
      confirmLabel: "remove",
      danger: true,
    });
    if (ok) {
      store.updateDashboard(dash.id, (cur) => ({
        ...cur,
        widgets: cur.widgets.filter((w) => w.id !== widget.id),
      }));
    }
  }

  const area = (r: Rect) => ({
    gridColumn: `${r.x + 1} / span ${r.w}`,
    gridRow: `${r.y + 1} / span ${r.h}`,
  });

  // Cells not covered by a widget (edit mode's "+ add" affordances).
  const emptyCells: { x: number; y: number }[] = [];
  if (editing) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!collides({ x, y, w: 1, h: 1 }, dash.widgets, null)) emptyCells.push({ x, y });
      }
    }
  }

  return (
    <div
      ref={gridRef}
      className={`dash-grid${editing ? " editing" : ""} dash-${sizing}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: fit
          ? `repeat(${rows}, minmax(0, 1fr))`
          : `repeat(${rows}, ${rowHeight}px)`,
        gap: GAP,
      }}
    >
      {editing &&
        emptyCells.map((c) => (
          <div key={`${c.x}:${c.y}`} className="dash-cell" style={area({ ...c, w: 1, h: 1 })}>
            <button
              className="dash-cell-add"
              title="Add widget"
              onClick={() => setPicker(c)}
            >
              +
            </button>
            {picker && picker.x === c.x && picker.y === c.y && (
              <WidgetPicker
                onPick={(type) => {
                  setPicker(null);
                  addWidget(type, c);
                }}
                onClose={() => setPicker(null)}
              />
            )}
          </div>
        ))}

      {dash.widgets.map((w) => (
        <WidgetFrame
          key={w.id}
          widget={w}
          def={WIDGET_DEFS[w.type]}
          dash={dash}
          store={store}
          editing={editing}
          dragging={drag?.widgetId === w.id}
          style={area(w)}
          onMoveStart={(e) => startMove(w, e)}
          onResizeStart={(e, edges) => startResize(w, e, edges)}
          onRemove={() => removeWidget(w)}
        />
      ))}

      {drag && drag.moved && (
        <div
          className={`dash-ghost${drag.valid ? "" : " invalid"}`}
          style={area(drag.ghost)}
        />
      )}

      {editing && dash.widgets.length === 0 && emptyCells.length === 0 && (
        <div className="dash-grid-hint">grid has no space — add rows or columns</div>
      )}
    </div>
  );
}
