import { useRouter } from "@cortex/core";
import "./recipes.css";
import { formatMinutes, totalMinutes } from "../shared/types";
import { Hero } from "./art";
import { recipePath } from "./components";
import { addDays, today, usePlan, useRecipeMap, useRecipes, weekStart } from "./data";

/* Recipes widgets for Home dashboards. */

/** Monday to Sunday with what's planned each day. */
export function WeekWidget() {
  const { navigate } = useRouter();
  const start = weekStart(today());
  const plan = usePlan(start, addDays(start, 6));
  const recipes = useRecipeMap();
  const now = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="rc-w">
      <span className="cx-label">This week’s meals</span>
      <ul className="rc-w__days">
        {days.map((d) => {
          const items = (plan.data ?? []).filter((e) => e.date === d);
          return (
            <li key={d} className={d === now ? "is-today" : d < now ? "is-past" : ""}>
              <span className="rc-w__day">{new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span>
              <span className="rc-w__meals">
                {items.length ? (
                  items.map((e) => {
                    const r = e.recipeId ? recipes.get(e.recipeId) : null;
                    return r ? (
                      <button key={e.id} type="button" className="rc-w__meal" onClick={() => navigate(recipePath(r))}>
                        {r.title}
                      </button>
                    ) : (
                      <span key={e.id} className="rc-w__note">
                        {e.note}
                      </span>
                    );
                  })
                ) : (
                  <span className="rc-w__none">—</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Today's planned recipe with its picture; a favourite to try when nothing's planned. */
export function TonightWidget() {
  const { navigate } = useRouter();
  const d = today();
  const plan = usePlan(d, d);
  const map = useRecipeMap();
  const all = useRecipes().data?.recipes ?? [];
  const planned = (plan.data ?? []).map((e) => (e.recipeId ? map.get(e.recipeId) : null)).find(Boolean);
  const pool = all.filter((r) => r.favourite).length ? all.filter((r) => r.favourite) : all;
  // Same suggestion all day: pick by date, not at random on every render.
  const idea = !planned && pool.length ? pool[Number(d.replace(/-/g, "")) % pool.length] : null;
  const r = planned ?? idea;
  if (!r) return <div className="dw-unconfigured">No recipes yet.</div>;
  return (
    <button type="button" className="rc-w rc-w--tonight" onClick={() => navigate(recipePath(r))}>
      <Hero hero={r.hero} title={r.title} tags={r.tags} />
      <span className="rc-w__body">
        <span className="cx-label">{planned ? "Tonight" : "Idea for tonight"}</span>
        <span className="rc-w__title">{r.title}</span>
        <span className="rc-muted rc-small">{[formatMinutes(totalMinutes(r)), `Serves ${r.servings}`].filter(Boolean).join(" · ")}</span>
      </span>
    </button>
  );
}

