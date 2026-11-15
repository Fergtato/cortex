import { useEffect, useMemo, useState, type ReactNode } from "react";
import { PageFrame, StoredImg, useDialog, useRouter } from "@cortex/core";
import { Button, Checkbox, Icon, Segmented } from "@cortex/ui";
import { formatIngredientAmount, formatMinutes, schedule, totalMinutes, type Recipe, type ScheduledStep } from "../shared/types";
import { Hero } from "./art";
import { FavButton } from "./components";
import { BASE, readTicks, usePatchRecipe, usePlanMutations, writeTicks } from "./data";
import { planDayOptions } from "./plan";

/*
 * One recipe, laid out like a recipe card: the summary, hero and
 * ingredients on top, the method below as numbered blocks or as a
 * timeline that shows when to start each step.
 */

const cap = (s: string) => s && s[0].toUpperCase() + s.slice(1);

export function RecipePage({ recipe }: { recipe: Recipe }) {
  const { navigate, search } = useRouter();
  const dialog = useDialog();
  const patch = usePatchRecipe();
  const { add } = usePlanMutations();
  const view = new URLSearchParams(search).get("view") === "timeline" ? "timeline" : "steps";
  const [servings, setServings] = useState(recipe.servings);
  const [ticks, setTicks] = useState<string[]>(() => readTicks(recipe.id));
  const [flash, setFlash] = useState("");
  useEffect(() => setServings(recipe.servings), [recipe.id, recipe.servings]);
  useEffect(() => setTicks(readTicks(recipe.id)), [recipe.id]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 2600);
    return () => clearTimeout(t);
  }, [flash]);

  const factor = servings / recipe.servings;
  const total = totalMinutes(recipe);
  const toggle = (id: string, on: boolean) => {
    const next = on ? [...ticks, id] : ticks.filter((x) => x !== id);
    setTicks(next);
    writeTicks(recipe.id, next);
  };
  const setView = (v: string) => {
    const p = new URLSearchParams(search);
    if (v === "steps") p.delete("view");
    else p.set("view", v);
    navigate(`${BASE}/r/${recipe.id}${p.size ? `?${p}` : ""}`, { replace: true });
  };

  const stats: [string, string][] = [
    ["Prep", formatMinutes(recipe.prepMin)],
    ["Total", formatMinutes(total)],
    ["Calories", recipe.calories ? String(recipe.calories) : ""],
    ["Level", cap(recipe.difficulty)],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <PageFrame
      crumbs={["Recipes", recipe.title]}
      actions={
        <>
          <Button
            size="sm"
            variant="ghost"
            icon="check"
            onClick={() => patch.mutate({ id: recipe.id, cooked: true }, { onSuccess: () => setFlash("Marked as cooked today") })}
          >
            Cooked it
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="calendar"
            onClick={async () => {
              const date = await dialog.choose(`Plan “${recipe.title}” for`, planDayOptions());
              if (date) add.mutate({ date, recipeId: recipe.id }, { onSuccess: () => setFlash("Added to your plan.") });
            }}
          >
            Plan
          </Button>
          <Button size="sm" variant="secondary" icon="pencil" onClick={() => navigate(`${BASE}/r/${recipe.id}/edit`)}>
            Edit
          </Button>
        </>
      }
    >
      <article className="rc-recipe">
        <section className="rc-top">
          <div className="rc-top__info">
            <div className="rc-top__titles">
              <h1 className="rc-title">{recipe.title}</h1>
              {recipe.subtitle && <p className="rc-subtitle">{recipe.subtitle}</p>}
            </div>
            {recipe.intro && (
              <div className="rc-intro">
                <p>{recipe.intro}</p>
              </div>
            )}
            {stats.length > 0 && (
              <dl className="rc-stats">
                {stats.map(([k, v]) => (
                  <div key={k}>
                    <dt className="cx-label">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {recipe.tags.length > 0 && (
              <div className="rc-tags">
                {recipe.tags.map((t) => (
                  <button key={t} type="button" className="rc-tag rc-tag--link" onClick={() => navigate(`${BASE}/all?tags=${encodeURIComponent(t)}`)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="rc-top__foot">
              <FavButton recipe={recipe} size="md" />
              <span className="rc-muted rc-small">
                {recipe.cookCount
                  ? `Cooked ${recipe.cookCount === 1 ? "once" : `${recipe.cookCount} times`}${recipe.lastCooked ? ` · last ${new Date(`${recipe.lastCooked}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`
                  : "Not cooked yet"}
              </span>
              {flash && (
                <span className="rc-flash" role="status">
                  {flash}
                </span>
              )}
            </div>
          </div>
          <div className="rc-top__hero">
            <Hero hero={recipe.hero} title={recipe.title} tags={recipe.tags} />
          </div>
        </section>

        <section className="rc-ingr cx-panel">
          <header className="rc-ingr__head">
            <span className="cx-label">Ingredients</span>
            <span className="rc-serves">
              <Button size="sm" variant="ghost" icon="minus" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings(servings - 1)} />
              <span className="rc-serves__n">
                <strong>{servings}</strong> {servings === 1 ? "serving" : "servings"}
              </span>
              <Button size="sm" variant="ghost" icon="plus" aria-label="More servings" onClick={() => setServings(servings + 1)} />
            </span>
            {ticks.length > 0 && (
              <>
                <span className="rc-muted rc-small">
                  {ticks.filter((t) => recipe.ingredients.some((i) => i.id === t)).length} of {recipe.ingredients.length} ticked
                </span>
                <button type="button" className="rc-link" onClick={() => (setTicks([]), writeTicks(recipe.id, []))}>
                  Clear
                </button>
              </>
            )}
          </header>
          <div className="rc-ingr__body">
            {recipe.ingredients.length ? (
              <ul className="rc-ingr__list">
                {recipe.ingredients.map((i) => {
                  const on = ticks.includes(i.id);
                  return (
                    <li key={i.id} className={on ? "is-on" : ""}>
                      <Checkbox checked={on} onChange={(v) => toggle(i.id, v)} label={i.name} className="rc-ingr__check" />
                      <span className="rc-ingr__amt">{formatIngredientAmount(i, factor)}</span>
                      {i.note && <span className="rc-ingr__note">{i.note}</span>}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rc-muted">No ingredients yet.</p>
            )}
            {recipe.equipment.length > 0 && (
              <aside className="rc-equip">
                <span className="cx-label">You’ll need</span>
                <ul>
                  {recipe.equipment.map((e, k) => (
                    <li key={k}>{e}</li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </section>

        <section className="rc-method">
          <header className="rc-method__head">
            <h2 className="cx-label">Method</h2>
            {recipe.steps.length > 0 && <span className="rc-muted rc-small">{recipe.steps.length} steps{total ? ` · ${formatMinutes(total)}` : ""}</span>}
            {recipe.steps.length > 1 && (
              <Segmented
                size="sm"
                value={view}
                onChange={setView}
                options={[
                  { value: "steps", label: "Steps" },
                  { value: "timeline", label: "Timeline" },
                ]}
              />
            )}
          </header>
          {!recipe.steps.length ? (
            <p className="rc-muted">No steps yet. Add them in Edit.</p>
          ) : view === "timeline" ? (
            <Timeline recipe={recipe} />
          ) : (
            <ol className="rc-steps">
              {recipe.steps.map((s, n) => (
                <li key={s.id} className="rc-step cx-panel">
                  {s.image && (
                    <span className="rc-step__img">
                      <StoredImg src={s.image} alt="" loading="lazy" />
                    </span>
                  )}
                  <div className="rc-step__body">
                    <div className="rc-step__head">
                      <span className="rc-step__n">{n + 1}</span>
                      {s.title && <h3 className="rc-step__title">{s.title}</h3>}
                    </div>
                    <p className="rc-step__text">
                      <Highlight text={s.text} names={recipe.ingredients.map((i) => i.name)} />
                    </p>
                    {(s.minutes || s.handsOff) && (
                      <div className="rc-step__foot">
                        {s.minutes ? (
                          <span className="rc-chip">
                            <Icon name="clock" size={12} /> {formatMinutes(s.minutes)}
                          </span>
                        ) : null}
                        {s.handsOff && <span className="rc-chip rc-chip--soft">Hands-off</span>}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {(recipe.notes || recipe.sourceUrl) && (
          <section className="rc-notes cx-panel">
            <span className="cx-label">Notes</span>
            {recipe.notes && <p className="rc-notes__text">{recipe.notes}</p>}
            {recipe.sourceUrl && /^https?:\/\//.test(recipe.sourceUrl) && (
              <a className="rc-source" href={recipe.sourceUrl} target="_blank" rel="noreferrer noopener">
                <Icon name="arrow-up-right" size={12} /> {recipe.sourceUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
              </a>
            )}
          </section>
        )}
      </article>
    </PageFrame>
  );
}

/** Bolds ingredient names inside step text, like a printed recipe card. */
function Highlight({ text, names }: { text: string; names: string[] }) {
  const re = useMemo(() => {
    const words = [...new Set(names.flatMap((n) => [n, n.split(/\s+/).pop() ?? ""]).map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
    if (!words.length) return null;
    return new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(e?s)?\\b`, "gi");
  }, [names]);
  if (!re) return <>{text}</>;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    out.push(<strong key={m.index}>{m[0]}</strong>);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

// ------------------------------------------------------------------ timeline

const clock = (base: Date | null, min: number) => {
  if (!base) return `+${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
  const d = new Date(base.getTime() + min * 60_000);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

function tickStep(total: number) {
  if (total <= 30) return 5;
  if (total <= 90) return 10;
  if (total <= 180) return 30;
  return 60;
}

/**
 * Gantt-style method: one row per step, bars placed by `schedule()`.
 * Solid bars need you; striped bars run by themselves while you get on.
 * Give a serving time and every step gets a clock time.
 */
function Timeline({ recipe }: { recipe: Recipe }) {
  const { items, total } = useMemo(() => schedule(recipe.steps), [recipe.steps]);
  const [serveAt, setServeAt] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const base = useMemo(() => {
    if (!/^\d{2}:\d{2}$/.test(serveAt)) return null;
    const [h, m] = serveAt.split(":").map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return new Date(d.getTime() - total * 60_000);
  }, [serveAt, total]);
  const step = tickStep(total);
  const ticks = Array.from({ length: Math.floor(total / step) + 1 }, (_, i) => i * step);
  const pct = (m: number) => `${(m / Math.max(total, 1)) * 100}%`;
  const estimated = items.some((i) => i.estimated);

  // Chronological "what to do when": every start, plus when hands-off steps are ready.
  const events = useMemo(() => {
    const ev: { at: number; kind: "start" | "ready" | "serve"; item?: ScheduledStep }[] = [];
    for (const it of items) {
      ev.push({ at: it.start, kind: "start", item: it });
      if (it.step.handsOff) ev.push({ at: it.end, kind: "ready", item: it });
    }
    ev.push({ at: total, kind: "serve" });
    return ev.sort((a, b) => a.at - b.at || (a.kind === "ready" ? -1 : 1));
  }, [items, total]);

  return (
    <div className="rc-tl cx-panel">
      <div className="rc-tl__bar">
        <span className="rc-tl__total">
          <span className="cx-label">Start to finish</span>
          <strong>{formatMinutes(total)}</strong>
        </span>
        <label className="rc-tl__serve">
          <span className="cx-label">Ready at</span>
          <input type="time" value={serveAt} onChange={(e) => setServeAt(e.target.value)} className="rc-time" />
        </label>
        {base && (
          <span className="rc-tl__start">
            <span className="cx-label">Start cooking</span>
            <strong>{clock(base, 0)}</strong>
          </span>
        )}
        <span className="rc-tl__legend">
          <span>
            <i className="rc-tl__key" /> Hands-on
          </span>
          <span>
            <i className="rc-tl__key rc-tl__key--off" /> Hands-off
          </span>
        </span>
      </div>

      <div className="rc-gantt" role="img" aria-label={`Timeline of ${items.length} steps over ${formatMinutes(total)}`}>
        <div className="rc-gantt__axis">
          <span />
          <div className="rc-gantt__ticks">
            {ticks.map((t) => (
              <span key={t} style={{ left: pct(t) }}>
                {base ? clock(base, t).replace(/\s?[AP]M$/i, "") : `${t}m`}
              </span>
            ))}
          </div>
        </div>
        {items.map((it) => (
          <div key={it.step.id} className={`rc-gantt__row${hover === it.index ? " is-hover" : ""}`} onMouseEnter={() => setHover(it.index)} onMouseLeave={() => setHover(null)}>
            <span className="rc-gantt__label">
              <span className="rc-gantt__n">{it.index + 1}</span>
              <span className="rc-gantt__name">{it.step.title || it.step.text.slice(0, 40) || `Step ${it.index + 1}`}</span>
            </span>
            <div className="rc-gantt__track">
              {ticks.map((t) => (
                <i key={t} className="rc-gantt__grid" style={{ left: pct(t) }} />
              ))}
              <span
                className={`rc-gantt__mark${it.step.handsOff ? " is-off" : ""}${it.estimated ? " is-est" : ""}`}
                style={{ left: pct(it.start), width: pct(it.end - it.start) }}
                tabIndex={0}
                onFocus={() => setHover(it.index)}
                onBlur={() => setHover(null)}
              >
                <span className="rc-gantt__min">{it.estimated ? "?" : `${it.end - it.start}m`}</span>
              </span>
              {hover === it.index && (
                <span className="rc-gantt__tip" style={{ left: pct(Math.min(it.start, total * 0.6)) }} role="tooltip">
                  <strong>
                    {it.index + 1}. {it.step.title || "Step"}
                  </strong>
                  <span>
                    {clock(base, it.start)} – {clock(base, it.end)} · {it.estimated ? "no time given" : formatMinutes(it.end - it.start)}
                    {it.step.handsOff ? " · hands-off" : ""}
                  </span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <ol className="rc-when" aria-label="What to do when">
        {events.map((e, k) => (
          <li key={k} className={`rc-when__item rc-when__item--${e.kind}`}>
            <span className="rc-when__at">{clock(base, e.at)}</span>
            <span className="rc-when__what">
              {e.kind === "serve" ? (
                <strong>Ready to serve</strong>
              ) : e.kind === "ready" ? (
                <>
                  Step {e.item!.index + 1} done: <strong>{e.item!.step.title || "hands-off step"}</strong>
                </>
              ) : (
                <>
                  <strong>
                    {e.item!.index + 1}. {e.item!.step.title || "Step"}
                  </strong>
                  {e.item!.step.handsOff && <span className="rc-chip rc-chip--soft">Hands-off</span>}
                  {e.item!.step.text && <span className="rc-when__text">{e.item!.step.text}</span>}
                </>
              )}
            </span>
          </li>
        ))}
      </ol>

      <p className="rc-hint">
        {estimated ? `Steps without a time count as ${5} minutes (marked “?”). ` : ""}
        Hands-off steps let the next one start straight away. In Edit, a step can wait for an earlier one to finish.
      </p>
    </div>
  );
}

