import { useState } from "react";
import { useRouter } from "@cortex/core";
import { Button, Icon } from "@cortex/ui";
import type { PlanEntry } from "../shared/types";
import { Hero } from "./hero";
import { RecipePicker, recipePath } from "./components";
import { addDays, isoDate, today, usePlan, usePlanMutations, useRecipeMap, weekStart } from "./data";

/*
 * The week plan: Monday to Sunday, recipes (or notes like "Eating out")
 * dropped on each day. Chips drag between days; the arrows page by week.
 */

export function weekLabel(start: string): string {
  const cur = weekStart(today());
  if (start === cur) return "This week";
  if (start === addDays(cur, 7)) return "Next week";
  if (start === addDays(cur, -7)) return "Last week";
  const s = new Date(`${start}T00:00:00`);
  const e = new Date(`${addDays(start, 6)}T00:00:00`);
  const f = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${f(s)} – ${f(e)}`;
}

export function WeekPlan({ compact = false }: { compact?: boolean }) {
  const [start, setStart] = useState(() => weekStart(today()));
  const end = addDays(start, 6);
  const plan = usePlan(start, end);
  const { add, move, remove } = usePlanMutations();
  const recipes = useRecipeMap();
  const { navigate } = useRouter();
  const [picking, setPicking] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const now = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDay = new Map<string, PlanEntry[]>(days.map((d) => [d, []]));
  for (const e of plan.data ?? []) byDay.get(e.date)?.push(e);
  const planned = (plan.data ?? []).length;

  return (
    <section className={`rc-week${compact ? " rc-week--compact" : ""}`} aria-label="Week plan">
      <header className="rc-week__head">
        <h2 className="cx-label">{weekLabel(start)}</h2>
        <span className="rc-muted rc-small">{planned ? `${planned} planned` : "Nothing planned"}</span>
        <span className="rc-week__nav">
          <Button size="sm" variant="ghost" icon="chevron-left" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))} />
          {start !== weekStart(now) && (
            <Button size="sm" variant="ghost" onClick={() => setStart(weekStart(now))}>
              Today
            </Button>
          )}
          <Button size="sm" variant="ghost" icon="chevron-right" aria-label="Next week" onClick={() => setStart(addDays(start, 7))} />
        </span>
      </header>
      <ol className="rc-week__days">
        {days.map((d) => {
          const date = new Date(`${d}T00:00:00`);
          const items = byDay.get(d) ?? [];
          return (
            <li
              key={d}
              className={`rc-day${d === now ? " is-today" : ""}${d < now ? " is-past" : ""}${over === d ? " is-over" : ""}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                setOver(d);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver((o) => (o === d ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                const entry = plan.data?.find((x) => x.id === dragId);
                if (entry && entry.date !== d) move.mutate({ id: entry.id, date: d });
                setDragId(null);
                setOver(null);
              }}
            >
              <div className="rc-day__head">
                <span className="rc-day__name">{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="rc-day__num">{date.getDate()}</span>
              </div>
              <ul className="rc-day__items">
                {items.map((e) => {
                  const r = e.recipeId ? recipes.get(e.recipeId) : null;
                  return (
                    <li
                      key={e.id}
                      className={`rc-meal${dragId === e.id ? " is-dragging" : ""}${r ? "" : " rc-meal--note"}`}
                      draggable
                      onDragStart={(ev) => {
                        setDragId(e.id);
                        ev.dataTransfer.effectAllowed = "move";
                        ev.dataTransfer.setData("text/plain", e.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                    >
                      <button type="button" className="rc-meal__hit" onClick={() => r && navigate(recipePath(r))} disabled={!r}>
                        {r && <Hero hero={r.hero} focus={r.heroFocus} className="rc-hero--thumb" />}
                        <span className="rc-meal__title">{r ? r.title : e.note || "Removed recipe"}</span>
                      </button>
                      <button type="button" className="rc-meal__x" aria-label="Remove from plan" onClick={() => remove.mutate(e.id)}>
                        <Icon name="x" size={12} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="rc-day__add" aria-label={`Add a meal on ${date.toLocaleDateString(undefined, { weekday: "long" })}`} onClick={() => setPicking(d)}>
                <Icon name="plus" size={12} />
                <span>Add</span>
              </button>
            </li>
          );
        })}
      </ol>
      {picking && (
        <RecipePicker
          title={`Plan ${new Date(`${picking}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}`}
          onClose={() => setPicking(null)}
          onPick={(r, note) => {
            add.mutate({ date: picking, recipeId: r?.id ?? null, note: note ?? "" });
            setPicking(null);
          }}
        />
      )}
    </section>
  );
}

/** The next 14 days as choices, for "Add to plan" on a recipe. */
export function planDayOptions() {
  const t = new Date();
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" });
    return { label, value: isoDate(d) };
  });
}
