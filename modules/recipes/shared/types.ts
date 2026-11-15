/*
 * Recipes: types shared by server and web, plus the pure helpers both use
 * (ingredient parsing and scaling, the cooking timeline). No React here.
 */

export interface Ingredient {
  id: string;
  /** Amount for the recipe's base servings; null for "to taste", "a pinch". */
  qty: number | null;
  unit: string;
  name: string;
  /** "finely chopped", "(Contains: Milk)". */
  note: string;
}

export interface Step {
  id: string;
  title: string;
  text: string;
  /** How long the step takes; null when not given. */
  minutes: number | null;
  /** Runs by itself (oven, simmer, rest): the next step can start while it goes. */
  handsOff: boolean;
  /** Waits for this earlier step to finish before starting (e.g. plate up after the oven). */
  after: string | null;
  /** Optional photo (`cortex-file:` ref). */
  image: string | null;
}

export type Difficulty = "" | "easy" | "medium" | "hard";

export interface RecipeData {
  title: string;
  subtitle: string;
  /** The intro / tip box at the top of the card. */
  intro: string;
  /** `cortex-file:<id>` for a photo, or `art:<name>` for an illustration. */
  hero: string;
  servings: number;
  prepMin: number | null;
  cookMin: number | null;
  calories: number | null;
  difficulty: Difficulty;
  tags: string[];
  ingredients: Ingredient[];
  equipment: string[];
  steps: Step[];
  notes: string;
  sourceUrl: string;
}

export interface Recipe extends RecipeData {
  id: string;
  favourite: boolean;
  cookCount: number;
  lastCooked: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  recipeId: string | null;
  /** Free text when there's no recipe ("Leftovers", "Eating out"). */
  note: string;
  sort: number;
}

export interface RecipesState {
  recipes: Recipe[];
}

export const BUILTIN_TAGS = [
  "Quick & easy",
  "Under 30 mins",
  "One pot",
  "Vegetarian",
  "Vegan",
  "Gluten free",
  "Dairy free",
  "High protein",
  "Healthy",
  "Comfort food",
  "Breakfast",
  "Lunch",
  "Dinner",
  "Dessert",
  "Snack",
  "Baking",
  "Batch cook",
  "Freezer friendly",
  "Family friendly",
  "Date night",
  "Spicy",
  "Budget",
  "Meal prep",
  "Summer",
  "Winter",
  "Italian",
  "Mexican",
  "Indian",
  "Japanese",
  "Chinese",
  "Thai",
  "Middle Eastern",
  "Korean",
];

export const emptyRecipe = (): RecipeData => ({
  title: "",
  subtitle: "",
  intro: "",
  hero: "",
  servings: 2,
  prepMin: null,
  cookMin: null,
  calories: null,
  difficulty: "",
  tags: [],
  ingredients: [],
  equipment: [],
  steps: [],
  notes: "",
  sourceUrl: "",
});

/** Total time: the timeline when steps carry minutes, else prep + cook. */
export function totalMinutes(r: RecipeData): number | null {
  const fromSteps = r.steps.some((s) => s.minutes) ? schedule(r.steps).total : 0;
  const given = (r.prepMin ?? 0) + (r.cookMin ?? 0);
  if (given) return given;
  return fromSteps || null;
}

export function formatMinutes(m: number | null | undefined): string {
  if (!m) return "";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

// ----------------------------------------------------------------- timeline

export interface ScheduledStep {
  step: Step;
  index: number;
  start: number;
  end: number;
  /** No minutes given: drawn as a short estimate. */
  estimated: boolean;
}

/** Minutes assumed for a step with no time, so the timeline still orders it. */
export const ESTIMATE_MIN = 5;

/**
 * Lays the steps out in time for one cook. A step starts when the cook is
 * free and (if set) its `after` step has finished. A hands-off step frees the
 * cook as soon as it starts, so the next step overlaps it. The meal is ready
 * when the last step ends.
 */
export function schedule(steps: Step[]): { items: ScheduledStep[]; total: number } {
  const ends = new Map<string, number>();
  let free = 0;
  const items = steps.map((step, index) => {
    const estimated = !step.minutes;
    const dur = step.minutes ?? ESTIMATE_MIN;
    const wait = step.after ? (ends.get(step.after) ?? 0) : 0;
    const start = Math.max(free, wait);
    const end = start + dur;
    ends.set(step.id, end);
    free = step.handsOff ? start : end;
    return { step, index, start, end, estimated };
  });
  // The last step finishes the meal: anything still running (a hands-off bake) must be done first.
  const total = items.reduce((m, s) => Math.max(m, s.end), 0);
  return { items, total };
}

// --------------------------------------------------------------- ingredients

const FRACTIONS: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅕": 0.2 };

const UNITS = [
  "g", "kg", "mg", "ml", "l", "cl", "dl", "oz", "lb", "lbs", "tsp", "tbsp", "cup", "cups", "pinch", "pinches", "clove", "cloves",
  "can", "cans", "tin", "tins", "pack", "packs", "packet", "packets", "bunch", "bunches", "handful", "handfuls", "slice", "slices",
  "sprig", "sprigs", "stick", "sticks", "piece", "pieces", "sheet", "sheets", "jar", "jars", "dash", "splash", "knob", "fl oz", "pint", "pints",
  "teaspoon", "teaspoons", "tablespoon", "tablespoons", "litre", "litres", "liter", "liters", "gram", "grams", "kilogram", "kilograms",
];
const UNIT_ALIASES: Record<string, string> = { teaspoon: "tsp", teaspoons: "tsp", tablespoon: "tbsp", tablespoons: "tbsp", gram: "g", grams: "g", kilogram: "kg", kilograms: "kg", litre: "l", litres: "l", liter: "l", liters: "l", lbs: "lb" };

function parseNumber(s: string): number | null {
  s = s.trim();
  if (!s) return null;
  if (s in FRACTIONS) return FRACTIONS[s];
  const uni = s.match(/^(\d+)\s*([½⅓⅔¼¾⅛⅕])$/);
  if (uni) return Number(uni[1]) + FRACTIONS[uni[2]];
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "200g spaghetti", "1 1/2 tbsp olive oil, plus extra", "Salt" → structured ingredient (without id). */
export function parseIngredient(line: string): Omit<Ingredient, "id"> {
  let rest = line.trim().replace(/^[-•*]\s*/, "");
  let qty: number | null = null;
  const num = rest.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\s*[½⅓⅔¼¾⅛⅕]|[½⅓⅔¼¾⅛⅕]|\d+(?:[.,]\d+)?)(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?/);
  if (num) {
    qty = parseNumber(num[1]);
    rest = rest.slice(num[0].length).trim();
  }
  let unit = "";
  if (qty !== null) {
    const lower = rest.toLowerCase();
    const u = [...UNITS].sort((a, b) => b.length - a.length).find((x) => lower === x || lower.startsWith(`${x} `) || lower.startsWith(`${x}.`));
    if (u) {
      unit = UNIT_ALIASES[u] ?? u;
      rest = rest.slice(u.length).replace(/^\.?\s*/, "");
      rest = rest.replace(/^of\s+/i, "");
    }
  }
  let note = "";
  const paren = rest.match(/\s*\(([^)]*)\)\s*$/);
  if (paren) {
    note = paren[1];
    rest = rest.slice(0, paren.index).trim();
  }
  const comma = rest.indexOf(",");
  if (comma > 0) {
    note = [rest.slice(comma + 1).trim(), note].filter(Boolean).join(", ");
    rest = rest.slice(0, comma).trim();
  }
  return { qty, unit, name: rest, note };
}

const NICE: [number, string][] = [
  [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.5, "½"], [2 / 3, "⅔"], [0.75, "¾"],
];
const METRIC = new Set(["g", "kg", "mg", "ml", "l", "cl", "dl"]);

/** Readable amount: fractions for spoons and counts, rounded numbers for weights. */
export function formatQty(qty: number | null, unit: string): string {
  if (qty === null) return "";
  if (METRIC.has(unit)) {
    const r = qty >= 100 ? Math.round(qty / 5) * 5 : qty >= 10 ? Math.round(qty) : Math.round(qty * 10) / 10;
    return String(r);
  }
  const whole = Math.floor(qty + 1e-6);
  const frac = qty - whole;
  if (frac < 0.06) return String(whole || (qty > 0 ? "<¼" : "0"));
  if (frac > 0.94) return String(whole + 1);
  const best = NICE.reduce((b, n) => (Math.abs(n[0] - frac) < Math.abs(b[0] - frac) ? n : b));
  if (Math.abs(best[0] - frac) < 0.07) return whole ? `${whole} ${best[1]}` : best[1];
  return String(Math.round(qty * 10) / 10);
}

export function formatIngredientAmount(i: Ingredient, factor = 1): string {
  const q = formatQty(i.qty === null ? null : i.qty * factor, i.unit);
  if (!q) return i.unit;
  if (!i.unit) return q;
  return METRIC.has(i.unit) || i.unit === "oz" || i.unit === "lb" ? `${q}${i.unit === "oz" || i.unit === "lb" ? " " : ""}${i.unit}` : `${q} ${i.unit}`;
}

/** Lowercase words for search: title, subtitle, tags and ingredient names. */
export function searchText(r: RecipeData): string {
  return [r.title, r.subtitle, ...r.tags, ...r.ingredients.map((i) => i.name)].join(" ").toLowerCase();
}
