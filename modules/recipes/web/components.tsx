import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { pickImage, useRouter } from "@cortex/core";
import { Button, Icon, Input } from "@cortex/ui";
import { formatMinutes, searchText, totalMinutes, type Recipe } from "../shared/types";
import { dishWords, hasPhoto, Hero } from "./hero";

/** Search text plus the dish family ("pasta" finds spaghetti carbonara). */
export const recipeText = (r: Recipe) => `${searchText(r)} ${dishWords(r.title)}`;
import { BASE, usePatchRecipe, useRecipes, useTags } from "./data";

export const recipePath = (r: { id: string }) => `${BASE}/r/${r.id}`;

export function Modal({ title, onClose, children, actions, wide }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  // Portalled: a dialog opened from a topbar button must not inherit the topbar's compact styles.
  return createPortal(
    <div className="cx-dialog-scrim" onMouseDown={onClose}>
      <div className={`cx-dialog rc-modal${wide ? " rc-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="rc-modal__head">
          <p className="cx-dialog__message">{title}</p>
          <Button size="sm" variant="ghost" icon="x" aria-label="Close" onClick={onClose} />
        </div>
        <div className="rc-modal__body">{children}</div>
        {actions && <div className="cx-dialog__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function FavButton({ recipe, size = "sm" }: { recipe: Recipe; size?: "sm" | "md" }) {
  const patch = usePatchRecipe();
  return (
    <button
      type="button"
      className={`rc-fav rc-fav--${size}${recipe.favourite ? " is-on" : ""}`}
      aria-pressed={recipe.favourite}
      aria-label={recipe.favourite ? "Remove from favourites" : "Add to favourites"}
      title={recipe.favourite ? "Favourite" : "Add to favourites"}
      onClick={(e) => {
        e.stopPropagation();
        patch.mutate({ id: recipe.id, favourite: !recipe.favourite });
      }}
    >
      <Icon name="heart" size={size === "sm" ? 14 : 16} />
    </button>
  );
}

export function RecipeCard({ recipe }: { recipe: Recipe }) {
  const { navigate } = useRouter();
  const total = totalMinutes(recipe);
  return (
    <article className="rc-card">
      <button type="button" className="rc-card__hit" onClick={() => navigate(recipePath(recipe))}>
        <Hero hero={recipe.hero} focus={recipe.heroFocus} />
        <span className="rc-card__body">
          <span className="rc-card__title">{recipe.title}</span>
          <span className="rc-card__meta">
            {[total && formatMinutes(total), recipe.servings && `Serves ${recipe.servings}`, recipe.difficulty && recipe.difficulty[0].toUpperCase() + recipe.difficulty.slice(1)].filter(Boolean).join(" · ")}
          </span>
          {recipe.tags.length > 0 && (
            <span className="rc-card__tags">
              {recipe.tags.slice(0, 2).map((t) => (
                <span key={t} className="rc-tag rc-tag--sm">
                  {t}
                </span>
              ))}
              {recipe.tags.length > 2 && <span className="rc-card__more">+{recipe.tags.length - 2}</span>}
            </span>
          )}
        </span>
      </button>
      <span className="rc-card__fav">
        <FavButton recipe={recipe} />
      </span>
    </article>
  );
}

/** A heading, a grid of cards and an optional "See all". Never a sideways scroller. */
export function Shelf({ title, recipes, to, limit = 4, meta }: { title: string; recipes: Recipe[]; to?: string; limit?: number; meta?: ReactNode }) {
  const { navigate } = useRouter();
  if (!recipes.length) return null;
  return (
    <section className="rc-shelf">
      <header className="rc-shelf__head">
        <h2 className="cx-label">{title}</h2>
        {meta && <span className="rc-muted rc-small">{meta}</span>}
        {to && recipes.length > limit && (
          <button type="button" className="rc-link" onClick={() => navigate(to)}>
            See all {recipes.length} <Icon name="chevron-right" size={12} />
          </button>
        )}
      </header>
      <div className="rc-grid">
        {recipes.slice(0, limit).map((r) => (
          <RecipeCard key={r.id} recipe={r} />
        ))}
      </div>
    </section>
  );
}

/** Pick tags from those in use and the built-ins, or type a new one. */
export function TagInput({ value, onChange }: { value: string[]; onChange: (tags: string[]) => void }) {
  const tags = useTags();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const add = (t: string) => {
    const name = t.trim().replace(/\s+/g, " ");
    if (name && !has(name)) onChange([...value, name]);
    setQ("");
  };
  const matches = tags.filter((t) => !has(t.name) && t.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 12);
  const exact = tags.some((t) => t.name.toLowerCase() === q.trim().toLowerCase());

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="rc-tagin" ref={box}>
      <div className="rc-tagin__box" onClick={() => box.current?.querySelector("input")?.focus()}>
        {value.map((t) => (
          <span key={t} className="rc-tag">
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
              <Icon name="x" size={10} />
            </button>
          </span>
        ))}
        <input
          value={q}
          placeholder={value.length ? "Add tag" : "Add tags: Vegetarian, Under 30 mins…"}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && q.trim()) {
              e.preventDefault();
              add(matches.find((m) => m.name.toLowerCase() === q.trim().toLowerCase())?.name ?? q);
            } else if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1));
          }}
          aria-label="Tags"
        />
      </div>
      {open && (matches.length > 0 || (q.trim() && !exact)) && (
        <div className="rc-tagin__menu" role="listbox">
          {q.trim() && !exact && !has(q) && (
            <button type="button" className="rc-tagin__opt" onMouseDown={(e) => e.preventDefault()} onClick={() => add(q)}>
              <Icon name="plus" size={12} /> Create “{q.trim()}”
            </button>
          )}
          {matches.map((t) => (
            <button key={t.name} type="button" className="rc-tagin__opt" onMouseDown={(e) => e.preventDefault()} onClick={() => add(t.name)}>
              {t.name}
              {t.count > 0 && <span className="rc-muted">{t.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Upload, replace or remove the photo, and choose which part shows when it's cropped. */
export function HeroPicker({ value, focus, onChange }: { value: string; focus: number; onChange: (patch: { hero?: string; heroFocus?: number }) => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const photo = hasPhoto(value);
  const upload = async () => {
    setBusy(true);
    setFailed(false);
    const ref = await pickImage();
    setBusy(false);
    if (ref) onChange({ hero: ref, heroFocus: 50 });
    else setFailed(true);
  };
  return (
    <div className="rc-heropick">
      <div className="rc-heropick__previews">
        <figure>
          <Hero hero={value} focus={focus} className="rc-hero--banner" />
          <figcaption className="rc-hint">Banner</figcaption>
        </figure>
        <figure>
          <Hero hero={value} focus={focus} />
          <figcaption className="rc-hint">Card</figcaption>
        </figure>
      </div>
      {photo && (
        <label className="rc-heropick__focus">
          <span className="cx-label">Position</span>
          <input type="range" min={0} max={100} value={focus} onChange={(e) => onChange({ heroFocus: Number(e.target.value) })} aria-label="Photo position, top to bottom" />
          <span className="rc-muted rc-small">{focus < 34 ? "Top" : focus > 66 ? "Bottom" : "Middle"}</span>
        </label>
      )}
      <div className="rc-heropick__actions">
        <Button size="sm" variant="secondary" icon="image" disabled={busy} onClick={upload}>
          {busy ? "Uploading…" : photo ? "Replace photo" : "Upload photo"}
        </Button>
        {(photo || value) && (
          <Button size="sm" variant="ghost" onClick={() => onChange({ hero: "", heroFocus: 50 })}>
            Remove
          </Button>
        )}
      </div>
      <p className="rc-hint">{failed ? "Upload cancelled or failed." : "Any shape works: large photos are shrunk, and the picture is cropped to fit each place it appears."}</p>
    </div>
  );
}

/** Search box + list for choosing a recipe (week plan). */
export function RecipePicker({ onPick, onClose, title }: { onPick: (r: Recipe | null, note?: string) => void; onClose: () => void; title: string }) {
  const recipes = useRecipes().data?.recipes ?? [];
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hits = recipes.filter((r) => words.every((w) => recipeText(r).includes(w)));
    return hits.sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.title.localeCompare(b.title));
  }, [recipes, q]);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="rc-picker">
        <Input autoFocus icon="search" placeholder="Search recipes or ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="rc-picker__list">
          {list.slice(0, 50).map((r) => (
            <li key={r.id}>
              <button type="button" className="rc-picker__item" onClick={() => onPick(r)}>
                <Hero hero={r.hero} focus={r.heroFocus} className="rc-hero--thumb" />
                <span className="rc-picker__text">
                  <span className="rc-picker__title">
                    {r.title}
                    {r.favourite && <Icon name="heart" size={11} className="rc-picker__heart" />}
                  </span>
                  <span className="rc-muted rc-small">{[formatMinutes(totalMinutes(r)), r.tags.slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
          {!list.length && <li className="rc-muted rc-pad">{recipes.length ? "No recipes match." : "No recipes yet."}</li>}
        </ul>
        {q.trim() && (
          <Button variant="ghost" size="sm" icon="plus" onClick={() => onPick(null, q.trim())}>
            Add “{q.trim()}” as a note
          </Button>
        )}
      </div>
    </Modal>
  );
}
