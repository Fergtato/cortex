import { z } from "zod";
import { newId } from "@cortex/core/server";
import { BUILTIN_TAGS, emptyRecipe, type RecipeData } from "../shared/types";

/*
 * "Create with AI": turns a written idea into a recipe draft. The model
 * answers in a simple JSON shape (step `after` as a step number); we add ids
 * and the server's usual validation happens when the person saves.
 */

const num = z.coerce.number().finite();
const maybeMin = z.union([num, z.null()]).optional().transform((v) => (v == null || v <= 0 ? null : Math.round(v)));

export const aiRecipe = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional().default(""),
  intro: z.string().optional().default(""),
  servings: num.optional().default(2),
  prepMin: maybeMin,
  cookMin: maybeMin,
  calories: maybeMin,
  difficulty: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
  ingredients: z
    .array(z.object({ qty: z.union([num, z.null()]).optional(), unit: z.string().nullish(), name: z.string().min(1), note: z.string().nullish() }))
    .min(1),
  equipment: z.array(z.string()).optional().default([]),
  steps: z
    .array(z.object({ title: z.string().nullish(), text: z.string().min(1), minutes: z.union([num, z.null()]).optional(), handsOff: z.boolean().optional(), after: z.union([num, z.null()]).optional() }))
    .min(1),
});

export function recipePrompt(idea: string, servings: number | null, tags: string[]) {
  const known = [...new Set([...tags, ...BUILTIN_TAGS])].slice(0, 80);
  const system = `You write recipes for Cortex, a personal cookbook app. Write one complete, realistic, tested-sounding recipe that fits the person's idea. Use British English and metric amounts.

Answer with JSON in exactly this shape:
{
  "title": "short dish name",
  "subtitle": "with … (the sides or key twist, lower case), may be empty",
  "intro": "one or two sentences: a tip or why it works",
  "servings": 2,
  "prepMin": 10,
  "cookMin": 25,
  "calories": 550,            // per serving, a sensible estimate
  "difficulty": "easy" | "medium" | "hard",
  "tags": ["…"],              // 2-6 tags, prefer these existing ones: ${JSON.stringify(known)}
  "ingredients": [{ "qty": 200, "unit": "g", "name": "spaghetti", "note": "" }],   // qty null for "to taste"; unit "" for counts
  "equipment": ["Large pan"],
  "steps": [{ "title": "Short title", "text": "What to do, 1-3 sentences.", "minutes": 10, "handsOff": false, "after": null }]
}

Rules for steps: give every step realistic minutes. Set "handsOff": true for steps that run by themselves (oven, simmering, resting, boiling pasta) so the cook can start the next step meanwhile. If a step must wait for an earlier hands-off step to finish, set "after" to that step's number (1-based); otherwise null. Order steps the way a cook would do them, starting long jobs early.`;
  const user = `Idea: ${idea.trim()}${servings ? `\nServings: ${servings}` : ""}`;
  return { system, messages: [{ role: "user" as const, content: user }], maxTokens: 4000, temperature: 0.7 };
}

/** Model output → a recipe draft (ids added, values clamped to what the editor accepts). */
export function toDraft(r: z.infer<typeof aiRecipe>): RecipeData {
  const stepIds = r.steps.map(() => newId());
  const diff = ["easy", "medium", "hard"].includes(r.difficulty.toLowerCase()) ? (r.difficulty.toLowerCase() as RecipeData["difficulty"]) : "";
  const clip = (s: string | null | undefined, n: number) => (s ?? "").trim().slice(0, n);
  return {
    ...emptyRecipe(),
    title: clip(r.title, 200),
    subtitle: clip(r.subtitle, 300),
    intro: clip(r.intro, 3000),
    servings: Math.min(100, Math.max(1, Math.round(r.servings || 2))),
    prepMin: r.prepMin,
    cookMin: r.cookMin,
    calories: r.calories,
    difficulty: diff,
    tags: [...new Set(r.tags.map((t) => clip(t, 40)).filter(Boolean))].slice(0, 8),
    ingredients: r.ingredients.slice(0, 200).map((i) => ({ id: newId(), qty: i.qty == null || i.qty < 0 ? null : Math.min(1e6, i.qty), unit: clip(i.unit, 40), name: clip(i.name, 200), note: clip(i.note, 300) })),
    equipment: r.equipment.map((e) => clip(e, 120)).filter(Boolean).slice(0, 50),
    steps: r.steps.slice(0, 100).map((s, k) => {
      const after = s.after != null && s.after >= 1 && s.after <= k ? stepIds[Math.round(s.after) - 1] : null;
      return { id: stepIds[k], title: clip(s.title, 200), text: clip(s.text, 5000), minutes: s.minutes == null || s.minutes <= 0 ? null : Math.min(100_000, Math.round(s.minutes)), handsOff: !!s.handsOff, after: after ?? null, image: null };
    }),
  };
}
