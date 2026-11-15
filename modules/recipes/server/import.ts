import { newId } from "@cortex/core/server";
import { BUILTIN_TAGS, emptyRecipe, parseIngredient, type RecipeData, type Step } from "../shared/types";

/*
 * Recipe import from a web page. Almost every recipe site embeds the recipe
 * as schema.org JSON-LD (it's what search engines read), so that's all we
 * parse: no site-specific scrapers. The result is a draft for the editor.
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", frac12: "½", frac14: "¼", frac34: "¾", deg: "°", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

export function decode(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

const str = (v: unknown): string => (typeof v === "string" ? decode(v) : typeof v === "number" ? String(v) : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const isType = (node: any, t: string) => list(node?.["@type"]).some((x) => typeof x === "string" && x.toLowerCase() === t.toLowerCase());

/** ISO 8601 duration (PT1H30M, P0DT45M) → minutes. */
export function isoMinutes(v: unknown): number | null {
  const m = typeof v === "string" ? v.match(/^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i) : null;
  if (!m) return null;
  const total = Math.round(Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
  return total > 0 ? total : null;
}

/** Finds the Recipe node in every JSON-LD block on the page (top level, arrays or @graph). */
export function findRecipe(html: string): any | null {
  const blocks = html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const b of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(b[1].trim().replace(/^<!--|-->$/g, "").replace(/^\/\/<!\[CDATA\[|\/\/\]\]>$/g, ""));
    } catch {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const n: any = stack.shift();
      if (!n || typeof n !== "object") continue;
      if (Array.isArray(n)) {
        stack.push(...n);
        continue;
      }
      if (isType(n, "Recipe")) return n;
      if (n["@graph"]) stack.push(n["@graph"]);
      if (n.mainEntity) stack.push(n.mainEntity);
    }
  }
  return null;
}

/** "Bake for 25-30 minutes" → 30; "1 hour" → 60. */
export function minutesIn(text: string): number | null {
  let best = 0;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|minutes?|mins?)\b/gi)) {
    const n = Number(m[2] ?? m[1]) * (/^h/i.test(m[3]) ? 60 : 1);
    best += n;
  }
  return best ? Math.round(best) : null;
}

const HANDS_OFF = /\b(bake|baking|roast|simmer|rest|chill|marinate|refrigerate|leave|cool|prove|proof|rise|slow.?cook|braise|soak|freeze|set aside)\b/i;

function steps(raw: unknown): Step[] {
  const out: { title: string; text: string }[] = [];
  const walk = (v: unknown, section = "") => {
    for (const item of list(v)) {
      if (typeof item === "string") {
        for (const line of decode(item).split(/\n+/)) if (line.trim()) out.push({ title: "", text: line.trim() });
      } else if (item && typeof item === "object") {
        const n = item as any;
        if (isType(n, "HowToSection") || n.itemListElement) {
          const before = out.length;
          walk(n.itemListElement, str(n.name));
          if (out[before] && !out[before].title && str(n.name)) out[before].title = str(n.name);
        } else {
          const text = str(n.text) || str(n.description) || str(n.name);
          const name = str(n.name);
          // Many sites copy the text into `name`; only keep a short, distinct one as a title.
          const title = name && name.length <= 60 && !text.startsWith(name.replace(/\.$/, "")) ? name : section && !out.length ? section : "";
          if (text) out.push({ title, text });
        }
      }
    }
  };
  walk(raw);
  return out.slice(0, 100).map(({ title, text }) => {
    const minutes = minutesIn(text);
    return { id: newId(), title: title.slice(0, 200), text: text.slice(0, 5000), minutes, handsOff: !!minutes && minutes >= 10 && HANDS_OFF.test(text), after: null, image: null };
  });
}

function imageUrl(v: unknown): string | null {
  for (const x of list(v)) {
    if (typeof x === "string") return x;
    if (x && typeof x === "object") {
      const u = (x as any).url ?? (x as any).contentUrl ?? (x as any)["@id"];
      if (typeof u === "string") return u;
    }
  }
  return null;
}

function tagsFor(r: any, total: number | null): string[] {
  const raw = [...list(r.recipeCategory), ...list(r.recipeCuisine), ...(typeof r.keywords === "string" ? r.keywords.split(",") : list(r.keywords))].map(str).filter(Boolean);
  const tags: string[] = [];
  const add = (t: string) => {
    const name = t.trim();
    if (name && name.length <= 30 && !tags.some((x) => x.toLowerCase() === name.toLowerCase())) tags.push(name);
  };
  // Known tags first (normalised to our spelling), then category and cuisine as given.
  for (const t of raw) {
    const known = BUILTIN_TAGS.find((b) => b.toLowerCase() === t.toLowerCase());
    if (known) add(known);
  }
  for (const t of [...list(r.recipeCategory), ...list(r.recipeCuisine)].map(str)) add(t.replace(/\b\w/g, (c) => c.toUpperCase()));
  const diets = list(r.suitableForDiet).map(str).join(" ");
  if (/vegan/i.test(diets)) add("Vegan");
  else if (/vegetarian/i.test(diets)) add("Vegetarian");
  if (/gluten/i.test(diets)) add("Gluten free");
  if (total && total <= 30) add("Under 30 mins");
  return tags.slice(0, 8);
}

export interface ImportResult {
  draft: RecipeData;
  imageUrl: string | null;
}

/** Maps a schema.org Recipe node onto a Cortex recipe draft. */
export function mapRecipe(r: any, url: string): ImportResult {
  const prep = isoMinutes(r.prepTime);
  const cook = isoMinutes(r.cookTime);
  const total = isoMinutes(r.totalTime);
  const yieldNum = list(r.recipeYield).map((y) => parseInt(str(y), 10)).find((n) => Number.isFinite(n) && n > 0);
  const kcal = parseInt(str(r.nutrition?.calories).replace(/,/g, ""), 10);
  const draft: RecipeData = {
    ...emptyRecipe(),
    title: str(r.name).replace(/\s+recipe$/i, "").slice(0, 200) || "Imported recipe",
    intro: str(r.description).slice(0, 3000),
    servings: Math.min(100, yieldNum ?? 2),
    prepMin: prep,
    cookMin: cook ?? (total && prep ? Math.max(0, total - prep) || null : total),
    calories: Number.isFinite(kcal) && kcal > 0 ? kcal : null,
    tags: tagsFor(r, total ?? ((prep ?? 0) + (cook ?? 0) || null)),
    ingredients: list(r.recipeIngredient ?? r.ingredients)
      .map(str)
      .filter(Boolean)
      .slice(0, 200)
      .map((line) => {
        const p = parseIngredient(line);
        return { id: newId(), ...p, name: p.name.slice(0, 200), note: p.note.slice(0, 300), unit: p.unit.slice(0, 40) };
      }),
    steps: steps(r.recipeInstructions),
    sourceUrl: url.slice(0, 2000),
  };
  let image = imageUrl(r.image);
  if (image) {
    try {
      image = new URL(image, url).toString();
    } catch {
      image = null;
    }
  }
  return { draft, imageUrl: image };
}
