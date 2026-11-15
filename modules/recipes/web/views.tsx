import { useEffect, useMemo, useState } from "react";
import { PageFrame, useRouter, type ModuleViewProps } from "@cortex/core";
import { Button, Icon, Input, Panel, Sidebar } from "@cortex/ui";
import "./recipes.css";
import { totalMinutes, type Recipe } from "../shared/types";
import { RecipeCard, recipeText, Shelf } from "./components";
import { BASE, useRecipes, useTags } from "./data";
import { RecipeEditor } from "./editor";
import { CookMode } from "./cook";
import { ImportButton, ImportDialog } from "./importer";
import { WeekPlan } from "./plan";
import { RecipePage } from "./recipe";

export function RecipesSidebar({ subpath }: ModuleViewProps) {
  const { navigate, search } = useRouter();
  const recipes = useRecipes().data?.recipes ?? [];
  const tags = useTags().filter((t) => t.count > 0);
  const [importing, setImporting] = useState(false);
  const p = new URLSearchParams(search);
  const active =
    subpath === "/all" ? (p.get("fav") ? "/all?fav=1" : p.get("tags") && !p.get("q") && !p.get("tags")!.includes(",") ? `/all?tags=${encodeURIComponent(p.get("tags")!)}` : "/all") : subpath === "/new" ? "/new" : subpath === "/" ? "/" : "";
  return (
    <Sidebar
      title="Recipes"
      actions={<Button size="sm" variant="ghost" icon="plus" aria-label="New recipe" onClick={() => navigate(`${BASE}/new`)} />}
      sections={[
        {
          items: [
            { id: "/", label: "Home", icon: "home" },
            { id: "/all", label: "All recipes", icon: "list", count: recipes.length },
            { id: "/all?fav=1", label: "Favourites", icon: "heart", count: recipes.filter((r) => r.favourite).length },
            { id: "/new", label: "New recipe", icon: "plus" },
            { id: "#import", label: "Import from link", icon: "link" },
          ],
        },
        ...(tags.length ? [{ label: "Tags", items: tags.slice(0, 30).map((t) => ({ id: `/all?tags=${encodeURIComponent(t.name)}`, label: t.name, count: t.count })) }] : []),
      ]}
      active={active}
      onSelect={(id) => (id === "#import" ? setImporting(true) : navigate(id === "/" ? BASE : BASE + id))}
    >
      {importing && <ImportDialog onClose={() => setImporting(false)} />}
    </Sidebar>
  );
}

export function RecipesPage({ subpath }: ModuleViewProps) {
  const q = useRecipes();
  const { search } = useRouter();
  const m = subpath.match(/^\/r\/([^/]+)(\/edit|\/cook)?$/);
  if (subpath === "/new") return <RecipeEditor key={search} />;
  if (m) {
    const recipe = q.data?.recipes.find((r) => r.id === m[1]);
    if (!recipe)
      return (
        <PageFrame crumbs={["Recipes", q.isPending ? "…" : "Not found"]}>
          {!q.isPending && <p className="rc-muted">This recipe doesn't exist any more.</p>}
        </PageFrame>
      );
    if (m[2] === "/cook") return <CookMode recipe={recipe} />;
    return m[2] ? <RecipeEditor key={recipe.id} recipe={recipe} /> : <RecipePage recipe={recipe} />;
  }
  if (subpath === "/all") return <Browse />;
  return <Home />;
}

function SearchBox({ initial = "" }: { initial?: string }) {
  const { navigate } = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      className="rc-searchbox"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`${BASE}/all${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
    >
      <Input icon="search" placeholder="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipes" />
    </form>
  );
}

const DAY = 86_400_000;

/** 30 minutes or less, or tagged as quick. */
const isQuick = (r: Recipe) => {
  const t = totalMinutes(r);
  return (!!t && t <= 30) || r.tags.some((x) => /under 30|quick/i.test(x));
};

function Home() {
  const { navigate } = useRouter();
  const recipes = useRecipes();
  const tags = useTags();
  const all = recipes.data?.recipes ?? [];
  const byNew = useMemo(() => [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [all]);
  const favs = all.filter((r) => r.favourite);
  const quick = all.filter(isQuick);
  const mostCooked = [...all].filter((r) => r.cookCount > 0).sort((a, b) => b.cookCount - a.cookCount);
  const forgotten = all
    .filter((r) => r.lastCooked && Date.now() - Date.parse(`${r.lastCooked}T00:00:00`) > 30 * DAY)
    .sort((a, b) => (a.lastCooked ?? "").localeCompare(b.lastCooked ?? ""));
  const untried = byNew.filter((r) => !r.cookCount);
  const topTags = tags.filter((t) => t.count >= 2 && !/under 30|quick/i.test(t.name)).slice(0, 4);
  const withTag = (t: string) => all.filter((r) => r.tags.some((x) => x.toLowerCase() === t.toLowerCase()));

  return (
    <PageFrame
      crumbs={["Recipes"]}
      actions={
        <>
          <SearchBox />
          <ImportButton />
          <Button size="sm" variant="primary" icon="plus" onClick={() => navigate(`${BASE}/new`)}>
            New recipe
          </Button>
        </>
      }
    >
      <div className="rc-root">
        <WeekPlan />
        {recipes.isSuccess && !all.length ? (
          <Panel className="rc-empty">
            <Icon name="pot" size={28} />
            <h2>Your cookbook is empty</h2>
            <p className="rc-muted">Add a recipe: ingredients with tick boxes, steps as blocks, and a timeline that tells you when to start each one.</p>
            <Button variant="primary" icon="plus" onClick={() => navigate(`${BASE}/new`)}>
              New recipe
            </Button>
          </Panel>
        ) : (
          <>
            <Shelf title="Favourites" recipes={favs} to={`${BASE}/all?fav=1`} />
            <Shelf title="Quick tonight" meta="30 minutes or less" recipes={quick} to={`${BASE}/all?quick=1`} />
            <Shelf title="Recently added" recipes={byNew} to={`${BASE}/all?sort=new`} />
            <Shelf title="Haven't made in a while" recipes={forgotten} to={`${BASE}/all?sort=oldest`} />
            <Shelf title="Not tried yet" recipes={untried} />
            <Shelf title="Most cooked" recipes={mostCooked} to={`${BASE}/all?sort=cooked`} />
            {topTags.map((t) => (
              <Shelf key={t.name} title={t.name} recipes={withTag(t.name)} to={`${BASE}/all?tags=${encodeURIComponent(t.name)}`} />
            ))}
          </>
        )}
      </div>
    </PageFrame>
  );
}

const SORTS = [
  { value: "new", label: "Newest" },
  { value: "az", label: "A–Z" },
  { value: "quick", label: "Quickest" },
  { value: "cooked", label: "Most cooked" },
  { value: "oldest", label: "Not made lately" },
];

function sortRecipes(list: Recipe[], sort: string): Recipe[] {
  const out = [...list];
  if (sort === "az") return out.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "quick") return out.sort((a, b) => (totalMinutes(a) ?? 1e9) - (totalMinutes(b) ?? 1e9));
  if (sort === "cooked") return out.sort((a, b) => b.cookCount - a.cookCount || a.title.localeCompare(b.title));
  if (sort === "oldest") return out.sort((a, b) => (a.lastCooked ?? "0").localeCompare(b.lastCooked ?? "0"));
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** All recipes, filtered by words (title, tags, ingredients), tags (all must match) and ingredients you have. */
function Browse() {
  const { search, navigate } = useRouter();
  const p = new URLSearchParams(search);
  const recipes = useRecipes().data?.recipes ?? [];
  const tags = useTags();
  const [q, setQ] = useState(p.get("q") ?? "");
  const [ing, setIng] = useState(p.get("ing") ?? "");
  const sel = (p.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const fav = p.get("fav") === "1";
  const quick = p.get("quick") === "1";
  const sort = p.get("sort") ?? "new";

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(search);
    if (v) n.set(k, v);
    else n.delete(k);
    navigate(`${BASE}/all${n.size ? `?${n}` : ""}`, { replace: true });
  };
  // Typing updates the address after a pause, so the filters survive going back.
  useEffect(() => {
    const t = setTimeout(() => {
      const n = new URLSearchParams(search);
      q.trim() ? n.set("q", q.trim()) : n.delete("q");
      ing.trim() ? n.set("ing", ing.trim()) : n.delete("ing");
      if (n.toString() !== new URLSearchParams(search).toString()) navigate(`${BASE}/all${n.size ? `?${n}` : ""}`, { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, ing]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTag = (t: string) => {
    const has = sel.some((x) => x.toLowerCase() === t.toLowerCase());
    setParam("tags", (has ? sel.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...sel, t]).join(",") || null);
  };

  const results = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const have = ing.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const list = recipes.filter((r) => {
      if (fav && !r.favourite) return false;
      const text = recipeText(r);
      if (!words.every((w) => text.includes(w))) return false;
      const rtags = r.tags.map((t) => t.toLowerCase());
      if (quick && !isQuick(r)) return false;
      if (!sel.every((t) => rtags.includes(t.toLowerCase()))) return false;
      if (have.length && !have.every((h) => r.ingredients.some((i) => i.name.toLowerCase().includes(h)))) return false;
      return true;
    });
    return sortRecipes(list, sort);
  }, [recipes, q, ing, sel.join(","), fav, quick, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const used = tags.filter((t) => t.count > 0);
  const title = fav ? "Favourites" : quick ? "Quick tonight" : sel.length === 1 && !q ? sel[0] : "All recipes";

  return (
    <PageFrame
      crumbs={["Recipes", title]}
      actions={
        <>
          <ImportButton />
          <Button size="sm" variant="primary" icon="plus" onClick={() => navigate(`${BASE}/new`)}>
            New recipe
          </Button>
        </>
      }
    >
      <div className="rc-root">
        <section className="rc-filters">
          <div className="rc-filters__row">
            <Input icon="search" placeholder="Search names, tags, ingredients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            <Input icon="basket" placeholder="Ingredients you have: chicken, lemon" value={ing} onChange={(e) => setIng(e.target.value)} aria-label="Ingredients you have" />
            <select className="rc-in rc-select" value={sort} onChange={(e) => setParam("sort", e.target.value === "new" ? null : e.target.value)} aria-label="Sort">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button type="button" className={`rc-tag rc-tag--toggle${fav ? " is-on" : ""}`} aria-pressed={fav} onClick={() => setParam("fav", fav ? null : "1")}>
              <Icon name="heart" size={11} /> Favourites
            </button>
          </div>
          {used.length > 0 && (
            <div className="rc-filters__tags" aria-label="Filter by tag">
              {used.map((t) => {
                const on = sel.some((x) => x.toLowerCase() === t.name.toLowerCase());
                return (
                  <button key={t.name} type="button" className={`rc-tag rc-tag--toggle${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggleTag(t.name)}>
                    {t.name}
                    <span className="rc-tag__n">{t.count}</span>
                  </button>
                );
              })}
              {sel.filter((s) => !used.some((u) => u.name.toLowerCase() === s.toLowerCase())).map((s) => (
                <button key={s} type="button" className="rc-tag rc-tag--toggle is-on" aria-pressed onClick={() => toggleTag(s)}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </section>
        <p className="rc-muted rc-small rc-count">
          {results.length} {results.length === 1 ? "recipe" : "recipes"}
          {(sel.length > 0 || q || ing || fav || quick) && (
            <button type="button" className="rc-link" onClick={() => (setQ(""), setIng(""), navigate(`${BASE}/all`, { replace: true }))}>
              Clear filters
            </button>
          )}
        </p>
        {results.length ? (
          <div className="rc-grid">
            {results.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        ) : (
          <p className="rc-muted">{recipes.length ? "Nothing matches. Try fewer filters." : "No recipes yet."}</p>
        )}
      </div>
    </PageFrame>
  );
}
