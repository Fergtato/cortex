import { useEffect, useRef, useState, type ReactNode } from "react";
import { newId, PageFrame, pickImage, StoredImg, useDialog, useRouter } from "@cortex/core";
import { Button, Icon, Toggle } from "@cortex/ui";
import { emptyRecipe, formatQty, parseIngredient, schedule, formatMinutes, type Ingredient, type Recipe, type RecipeData, type Step } from "../shared/types";
import { HeroPicker, TagInput } from "./components";
import { BASE, peekPendingDraft, setPendingDraft, useDeleteRecipe, useSaveRecipe } from "./data";
import { ImportButton } from "./importer";

/*
 * Create / edit a recipe. Ingredients are rows (paste a list to fill them
 * fast); steps are blocks with a time, a hands-off switch and an optional
 * "wait for step N" that drives the timeline.
 */

const newStep = (): Step => ({ id: newId(), title: "", text: "", minutes: null, handsOff: false, after: null, image: null });
const newIngredient = (): Ingredient => ({ id: newId(), qty: null, unit: "", name: "", note: "" });

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`rc-field${wide ? " rc-field--wide" : ""}`}>
      <span className="cx-label">{label}</span>
      {children}
      {hint && <span className="rc-hint">{hint}</span>}
    </label>
  );
}

const numOrNull = (s: string) => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Amount text box: "1 1/2", "½", "200". Keeps the typed text until blur. */
function QtyInput({ value, unit, onChange }: { value: number | null; unit: string; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(() => formatQty(value, unit));
  useEffect(() => setText((t) => (parseIngredient(t).qty === value ? t : formatQty(value, unit))), [value, unit]);
  return (
    <input
      className="rc-in rc-in--qty"
      value={text}
      placeholder="Qty"
      aria-label="Amount"
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value.trim() ? parseIngredient(e.target.value).qty : null);
      }}
      onBlur={() => setText(formatQty(value, unit))}
    />
  );
}

export function RecipeEditor({ recipe }: { recipe?: Recipe }) {
  const { navigate } = useRouter();
  const dialog = useDialog();
  const save = useSaveRecipe();
  const del = useDeleteRecipe();
  const [d, setD] = useState<RecipeData>(() => {
    if (!recipe) {
      const draft = peekPendingDraft();
      if (draft) return { ...emptyRecipe(), ...draft, steps: draft.steps.length ? draft.steps : [newStep()] };
      return { ...emptyRecipe(), steps: [newStep()], ingredients: [newIngredient()] };
    }
    const { id: _i, favourite: _f, cookCount: _c, lastCooked: _l, createdAt: _a, updatedAt: _u, ...data } = recipe;
    return data;
  });
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(() => !recipe && !!peekPendingDraft());
  const imported = !recipe && !!peekPendingDraft();
  // The draft is used once: leaving the page (saved or not) drops it.
  useEffect(() => () => setPendingDraft(null), []);
  const [paste, setPaste] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!recipe) titleRef.current?.focus();
  }, [recipe]);

  const set = (patch: Partial<RecipeData>) => {
    setD((x) => ({ ...x, ...patch }));
    setDirty(true);
  };
  const setIng = (id: string, patch: Partial<Ingredient>) => set({ ingredients: d.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const setStep = (id: string, patch: Partial<Step>) => set({ steps: d.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const moveIn = <T,>(list: T[], i: number, by: number) => {
    const next = [...list];
    const j = i + by;
    if (j < 0 || j >= next.length) return list;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  };
  const back = recipe ? `${BASE}/r/${recipe.id}` : BASE;

  const submit = () => {
    setError("");
    const clean: RecipeData = {
      ...d,
      title: d.title.trim(),
      ingredients: d.ingredients.filter((i) => i.name.trim()).map((i) => ({ ...i, name: i.name.trim(), unit: i.unit.trim(), note: i.note.trim() })),
      steps: d.steps.filter((s) => s.title.trim() || s.text.trim()),
      equipment: d.equipment.map((e) => e.trim()).filter(Boolean),
    };
    // A step can only wait for one that still exists and comes earlier.
    clean.steps = clean.steps.map((s, i) => (s.after && clean.steps.slice(0, i).some((p) => p.id === s.after) ? s : { ...s, after: null }));
    if (!clean.title) {
      setError("Give the recipe a name.");
      titleRef.current?.focus();
      return;
    }
    save.mutate(
      { id: recipe?.id, data: clean },
      {
        onSuccess: (r) => {
          setDirty(false);
          navigate(`${BASE}/r/${r.id}`, { replace: !recipe });
        },
        onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save."),
      },
    );
  };

  const cancel = async () => {
    if (dirty && !(await dialog.confirm("Discard your changes?", { confirmLabel: "Discard", danger: true }))) return;
    navigate(back);
  };

  const timeline = schedule(d.steps.filter((s) => s.title.trim() || s.text.trim()));

  return (
    <PageFrame
      crumbs={["Recipes", ...(recipe ? [{ label: recipe.title, to: back }] : []), recipe ? "Edit" : "New recipe"]}
      actions={
        <>
          {!recipe && !imported && <ImportButton label="Import from link" />}
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" icon="check" disabled={save.isPending} onClick={submit}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <form
        className="rc-edit"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {imported && !error && (
          <p className="rc-notice">Imported from {d.sourceUrl.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}. Check it over, then save.</p>
        )}
        {error && (
          <p className="rc-error" role="alert">
            {error}
          </p>
        )}

        <section className="rc-edit__top">
          <div className="rc-edit__card cx-panel">
            <span className="cx-label">Recipe</span>
            <Field label="Name">
              <input ref={titleRef} className="rc-in rc-in--title" value={d.title} placeholder="Crispy chicken thighs" onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <Field label="Subtitle">
              <input className="rc-in" value={d.subtitle} placeholder="with cucumber tomato salad and brown butter corn" onChange={(e) => set({ subtitle: e.target.value })} />
            </Field>
            <Field label="Intro or tip" hint="Shown in a box at the top of the card.">
              <textarea className="rc-in rc-ta" rows={3} value={d.intro} placeholder="Toasting butter in the pan gives it a nutty flavour." onChange={(e) => set({ intro: e.target.value })} />
            </Field>
            <div className="rc-edit__nums">
              <Field label="Servings">
                <input className="rc-in" type="number" min={1} max={100} value={d.servings} onChange={(e) => set({ servings: Math.max(1, numOrNull(e.target.value) ?? 1) })} />
              </Field>
              <Field label="Prep (min)">
                <input className="rc-in" type="number" min={0} value={d.prepMin ?? ""} onChange={(e) => set({ prepMin: numOrNull(e.target.value) })} />
              </Field>
              <Field label="Cook (min)">
                <input className="rc-in" type="number" min={0} value={d.cookMin ?? ""} onChange={(e) => set({ cookMin: numOrNull(e.target.value) })} />
              </Field>
              <Field label="Calories">
                <input className="rc-in" type="number" min={0} value={d.calories ?? ""} placeholder="per serving" onChange={(e) => set({ calories: numOrNull(e.target.value) })} />
              </Field>
              <Field label="Level">
                <select className="rc-in rc-select" value={d.difficulty} onChange={(e) => set({ difficulty: e.target.value as RecipeData["difficulty"] })}>
                  <option value="">—</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </Field>
            </div>
            <Field label="Tags" wide>
              <TagInput value={d.tags} onChange={(tags) => set({ tags })} />
            </Field>
          </div>
          <div className="rc-edit__hero cx-panel">
            <span className="cx-label">Picture</span>
            <HeroPicker value={d.hero} focus={d.heroFocus ?? 50} onChange={(patch) => set(patch)} />
          </div>
        </section>

        <section className="cx-panel rc-edit__section">
          <header className="rc-edit__head">
            <span className="cx-label">Ingredients</span>
            <span className="rc-muted rc-small">Amounts for {d.servings} {d.servings === 1 ? "serving" : "servings"}</span>
            <Button size="sm" variant="ghost" icon="copy" onClick={() => setPaste("")}>
              Paste a list
            </Button>
          </header>
          {paste !== null && (
            <div className="rc-paste">
              <textarea
                autoFocus
                className="rc-in rc-ta"
                rows={6}
                value={paste}
                placeholder={"One per line:\n200g spaghetti\n2 cloves garlic, crushed\n1 1/2 tbsp olive oil\nSalt and pepper"}
                onChange={(e) => setPaste(e.target.value)}
              />
              <div className="rc-paste__actions">
                <Button size="sm" variant="ghost" onClick={() => setPaste(null)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!paste.trim()}
                  onClick={() => {
                    const rows = paste.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ id: newId(), ...parseIngredient(l) }));
                    set({ ingredients: [...d.ingredients.filter((i) => i.name.trim()), ...rows] });
                    setPaste(null);
                  }}
                >
                  Add {paste.split("\n").filter((l) => l.trim()).length || ""} ingredients
                </Button>
              </div>
            </div>
          )}
          <ul className="rc-ilist">
            {d.ingredients.map((i, n) => (
              <li key={i.id} className="rc-irow">
                <QtyInput value={i.qty} unit={i.unit} onChange={(qty) => setIng(i.id, { qty })} />
                <input className="rc-in rc-in--unit" value={i.unit} placeholder="Unit" aria-label="Unit" onChange={(e) => setIng(i.id, { unit: e.target.value })} />
                <input
                  className="rc-in rc-in--name"
                  value={i.name}
                  placeholder="Ingredient"
                  aria-label="Ingredient"
                  onChange={(e) => setIng(i.id, { name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const ni = newIngredient();
                      const list = [...d.ingredients];
                      list.splice(n + 1, 0, ni);
                      set({ ingredients: list });
                      requestAnimationFrame(() => (document.querySelectorAll<HTMLInputElement>(".rc-in--name")[n + 1])?.focus());
                    }
                  }}
                />
                <input className="rc-in rc-in--note" value={i.note} placeholder="Note" aria-label="Note" onChange={(e) => setIng(i.id, { note: e.target.value })} />
                <span className="rc-irow__btns">
                  <Button size="sm" variant="ghost" icon="arrow-up" aria-label="Move up" disabled={n === 0} onClick={() => set({ ingredients: moveIn(d.ingredients, n, -1) })} />
                  <Button size="sm" variant="ghost" icon="x" aria-label="Remove ingredient" onClick={() => set({ ingredients: d.ingredients.filter((x) => x.id !== i.id) })} />
                </span>
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" icon="plus" className="rc-add" onClick={() => set({ ingredients: [...d.ingredients, newIngredient()] })}>
            Add ingredient
          </Button>
          <Field label="You’ll need" hint="Equipment, one per line." wide>
            <textarea className="rc-in rc-ta" rows={3} value={d.equipment.join("\n")} placeholder={"Large pan\nBaking tray"} onChange={(e) => set({ equipment: e.target.value.split("\n") })} />
          </Field>
        </section>

        <section className="rc-edit__steps">
          <header className="rc-edit__head">
            <span className="cx-label">Method</span>
            {timeline.total > 0 && <span className="rc-muted rc-small">Timeline: {formatMinutes(timeline.total)} start to finish</span>}
          </header>
          <ol className="rc-steps rc-steps--edit">
            {d.steps.map((s, n) => (
              <li key={s.id} className="rc-step rc-step--edit cx-panel">
                <div className="rc-step__head">
                  <span className="rc-step__n">{n + 1}</span>
                  <input className="rc-in rc-in--steptitle" value={s.title} placeholder="Step title (Preheat and prep)" aria-label={`Step ${n + 1} title`} onChange={(e) => setStep(s.id, { title: e.target.value })} />
                  <span className="rc-irow__btns">
                    <Button size="sm" variant="ghost" icon="arrow-up" aria-label="Move step up" disabled={n === 0} onClick={() => set({ steps: moveIn(d.steps, n, -1) })} />
                    <Button size="sm" variant="ghost" icon="arrow-down" aria-label="Move step down" disabled={n === d.steps.length - 1} onClick={() => set({ steps: moveIn(d.steps, n, 1) })} />
                    <Button size="sm" variant="ghost" icon="trash" aria-label="Delete step" onClick={() => set({ steps: d.steps.filter((x) => x.id !== s.id) })} />
                  </span>
                </div>
                <textarea className="rc-in rc-ta" rows={4} value={s.text} placeholder="What to do" aria-label={`Step ${n + 1} instructions`} onChange={(e) => setStep(s.id, { text: e.target.value })} />
                <div className="rc-step__opts">
                  <label className="rc-inline">
                    <Icon name="clock" size={12} />
                    <input className="rc-in rc-in--min" type="number" min={0} value={s.minutes ?? ""} placeholder="—" aria-label="Minutes" onChange={(e) => setStep(s.id, { minutes: numOrNull(e.target.value) })} />
                    <span className="rc-muted rc-small">min</span>
                  </label>
                  <Toggle checked={s.handsOff} onChange={(v) => setStep(s.id, { handsOff: v })} label="Hands-off" />
                  {n > 0 && (
                    <label className="rc-inline">
                      <span className="rc-muted rc-small">Starts</span>
                      <select className="rc-in rc-select rc-select--sm" value={s.after ?? ""} onChange={(e) => setStep(s.id, { after: e.target.value || null })}>
                        <option value="">when you’re free</option>
                        {d.steps.slice(0, n).map((p, k) => (
                          <option key={p.id} value={p.id}>
                            after step {k + 1} finishes{p.title ? ` (${p.title.slice(0, 24)})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="rc-step__imgedit">
                  {s.image ? (
                    <>
                      <StoredImg src={s.image} alt="" className="rc-step__thumb" />
                      <Button size="sm" variant="ghost" onClick={() => setStep(s.id, { image: null })}>
                        Remove photo
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="image"
                      onClick={async () => {
                        const ref = await pickImage();
                        if (ref) setStep(s.id, { image: ref });
                      }}
                    >
                      Add photo
                    </Button>
                  )}
                </div>
              </li>
            ))}
            <li className="rc-step rc-step--add">
              <button type="button" onClick={() => set({ steps: [...d.steps, newStep()] })}>
                <Icon name="plus" size={16} />
                <span>Add step</span>
              </button>
            </li>
          </ol>
        </section>

        <section className="cx-panel rc-edit__section">
          <span className="cx-label">Notes</span>
          <Field label="Source link" wide>
            <input className="rc-in" value={d.sourceUrl} placeholder="https://" onChange={(e) => set({ sourceUrl: e.target.value })} />
          </Field>
          <Field label="Notes" wide>
            <textarea className="rc-in rc-ta" rows={4} value={d.notes} placeholder="Swaps, what worked, what to try next time" onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </section>

        {recipe && (
          <div className="rc-edit__danger">
            <Button
              size="sm"
              variant="ghost"
              icon="copy"
              disabled={save.isPending}
              onClick={() => save.mutate({ data: duplicateData(recipe) }, { onSuccess: (r) => navigate(`${BASE}/r/${r.id}/edit`) })}
            >
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon="trash"
              onClick={async () => {
                if (!(await dialog.confirm(`Delete “${recipe.title}”? It's also removed from your plan.`, { confirmLabel: "Delete", danger: true }))) return;
                del.mutate(recipe.id, { onSuccess: () => navigate(BASE, { replace: true }) });
              }}
            >
              Delete recipe
            </Button>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </PageFrame>
  );
}

/** Copy of a recipe as a new draft (for "Duplicate"). */
export function duplicateData(r: Recipe): RecipeData {
  const { id: _i, favourite: _f, cookCount: _c, lastCooked: _l, createdAt: _a, updatedAt: _u, ...data } = r;
  const ids = new Map(data.steps.map((s) => [s.id, newId()]));
  return {
    ...data,
    title: `${data.title} (copy)`,
    ingredients: data.ingredients.map((i) => ({ ...i, id: newId() })),
    steps: data.steps.map((s) => ({ ...s, id: ids.get(s.id)!, after: s.after ? (ids.get(s.after) ?? null) : null })),
  };
}
