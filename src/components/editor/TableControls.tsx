import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";

/**
 * On-table controls for basic content tables (replacing the old toolbar ops):
 *  - a column handle on the active column's top edge and a row handle on the
 *    active row's left edge, each opening an insert/delete menu;
 *  - "+" bars along the bottom and right edges of the hovered table that
 *    append a row / column at the end.
 * Positioned absolutely inside `containerRef` (the `.editor-content` box),
 * measured from the live table DOM after every editor transaction.
 */

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

type Menu = "row" | "col" | null;

function relRect(el: Element, container: Element): Rect {
  const r = el.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  return { top: r.top - c.top, left: r.left - c.left, width: r.width, height: r.height };
}

/** The table cell (td/th) containing the current selection, if any. */
function selectedCell(editor: Editor): HTMLTableCellElement | null {
  if (!editor.isActive("table")) return null;
  try {
    const { node } = editor.view.domAtPos(editor.state.selection.from);
    const el = node instanceof Element ? node : node.parentElement;
    return (el?.closest("td, th") as HTMLTableCellElement | null) ?? null;
  } catch {
    return null;
  }
}

export function TableControls({
  editor,
  containerRef,
}: {
  editor: Editor;
  containerRef: RefObject<HTMLDivElement>;
}) {
  const [, setTick] = useState(0);
  const rerender = useCallback(() => setTick((t) => t + 1), []);
  const [hoverTable, setHoverTable] = useState<HTMLTableElement | null>(null);
  const [menu, setMenu] = useState<Menu>(null);

  // Re-measure on every editor change (content or selection) and on resize.
  useEffect(() => {
    editor.on("transaction", rerender);
    window.addEventListener("resize", rerender);
    return () => {
      editor.off("transaction", rerender);
      window.removeEventListener("resize", rerender);
    };
  }, [editor, rerender]);

  // Track which table the pointer is over; hovering the controls themselves
  // (which sit just outside the table) keeps the current table.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMove = (e: MouseEvent) => {
      const t = e.target as Element;
      if (t.closest(".tbl-ctrl")) return;
      const table = t.closest("table.content-table") as HTMLTableElement | null;
      setHoverTable((prev) => (prev === table ? prev : table));
    };
    const onLeave = () => setHoverTable(null);
    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
    };
  }, [containerRef]);

  // Close the menu on outside click / Escape / when the selection leaves the table.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest(".tbl-ctrl")) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const container = containerRef.current;
  const cell = selectedCell(editor);
  const activeTable = (cell?.closest("table.content-table") as HTMLTableElement | null) ?? null;
  const table = hoverTable?.isConnected ? hoverTable : activeTable;

  useLayoutEffect(() => {
    if (!cell && menu) setMenu(null);
  }, [cell, menu]);

  if (!container || !table || !table.isConnected) return null;

  const t = relRect(table, container);
  const cellOnTable = cell && activeTable === table ? cell : null;
  const row = cellOnTable?.parentElement ?? null;
  const rowRect = row ? relRect(row, container) : null;
  const colRect = cellOnTable ? relRect(cellOnTable, container) : null;

  const run = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => {
    fn(editor.chain().focus()).run();
    setMenu(null);
  };

  // Put the caret in a given cell (used by the append bars, which act on the
  // hovered table regardless of where the selection currently is).
  const caretInto = (target: Element | null | undefined) => {
    if (!target) return false;
    const pos = editor.view.posAtDOM(target, 0);
    editor.commands.setTextSelection(pos + 1);
    return true;
  };

  const appendRow = () => {
    const rows = table.rows;
    if (caretInto(rows[rows.length - 1]?.cells[0])) run((c) => c.addRowAfter());
  };
  const appendCol = () => {
    const first = table.rows[0];
    if (caretInto(first?.cells[first.cells.length - 1])) run((c) => c.addColumnAfter());
  };

  const noFocusSteal = (e: React.MouseEvent) => e.preventDefault();

  return (
    <>
      {colRect && (
        <div
          className="tbl-ctrl tbl-handle tbl-handle-col"
          style={{ top: t.top - 7, left: colRect.left + colRect.width / 2 - 12 }}
        >
          <button
            title="Column options"
            className={menu === "col" ? "active" : ""}
            onMouseDown={noFocusSteal}
            onClick={() => setMenu(menu === "col" ? null : "col")}
          >
            ···
          </button>
          {menu === "col" && (
            <div className="tbl-menu">
              <button onMouseDown={noFocusSteal} onClick={() => run((c) => c.addColumnBefore())}>
                ← insert left
              </button>
              <button onMouseDown={noFocusSteal} onClick={() => run((c) => c.addColumnAfter())}>
                → insert right
              </button>
              <button onMouseDown={noFocusSteal} onClick={() => run((c) => c.deleteColumn())}>
                − delete column
              </button>
              <div className="tbl-menu-sep" />
              <button
                className="danger"
                onMouseDown={noFocusSteal}
                onClick={() => run((c) => c.deleteTable())}
              >
                ⌫ delete table
              </button>
            </div>
          )}
        </div>
      )}

      {rowRect && (
        <div
          className="tbl-ctrl tbl-handle tbl-handle-row"
          style={{ top: rowRect.top + rowRect.height / 2 - 11, left: t.left - 16 }}
        >
          <button
            title="Row options"
            className={menu === "row" ? "active" : ""}
            onMouseDown={noFocusSteal}
            onClick={() => setMenu(menu === "row" ? null : "row")}
          >
            ⋮
          </button>
          {menu === "row" && (
            <div className="tbl-menu">
              <button onMouseDown={noFocusSteal} onClick={() => run((c) => c.addRowBefore())}>
                ↑ insert above
              </button>
              <button onMouseDown={noFocusSteal} onClick={() => run((c) => c.addRowAfter())}>
                ↓ insert below
              </button>
              <button onMouseDown={noFocusSteal} onClick={() => run((c) => c.deleteRow())}>
                − delete row
              </button>
              <div className="tbl-menu-sep" />
              <button
                className="danger"
                onMouseDown={noFocusSteal}
                onClick={() => run((c) => c.deleteTable())}
              >
                ⌫ delete table
              </button>
            </div>
          )}
        </div>
      )}

      <button
        className="tbl-ctrl tbl-add tbl-add-row"
        title="Add row"
        style={{ top: t.top + t.height + 2, left: t.left, width: t.width }}
        onMouseDown={noFocusSteal}
        onClick={appendRow}
      >
        +
      </button>
      <button
        className="tbl-ctrl tbl-add tbl-add-col"
        title="Add column"
        style={{ top: t.top, left: t.left + t.width + 2, height: t.height }}
        onMouseDown={noFocusSteal}
        onClick={appendCol}
      >
        +
      </button>
    </>
  );
}
