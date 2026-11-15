import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@cortex/core";
import { BUILTIN_TAGS, type PlanEntry, type Recipe, type RecipeData, type RecipesState } from "../shared/types";

/*
 * Recipes on the client. The whole collection loads at once (a personal
 * cookbook is hundreds of rows, not millions), so search and tag filters
 * run in the browser. Writes update the cache directly.
 */

const R = "/recipes";
export const BASE = "/recipes";
const KEY = ["recipes", "all"] as const;

export function useRecipes() {
  return useQuery({ queryKey: KEY, queryFn: () => api<RecipesState>(`${R}/recipes`) });
}

export function useRecipeMap(): Map<string, Recipe> {
  const recipes = useRecipes().data?.recipes;
  return useMemo(() => new Map((recipes ?? []).map((r) => [r.id, r])), [recipes]);
}

/** Every tag in use (by count), then the built-in suggestions not yet used. */
export function useTags(): { name: string; count: number }[] {
  const recipes = useRecipes().data?.recipes;
  return useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const r of recipes ?? []) for (const t of r.tags) {
      const k = t.toLowerCase();
      const cur = counts.get(k);
      if (cur) cur.count++;
      else counts.set(k, { name: t, count: 1 });
    }
    const used = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return [...used, ...BUILTIN_TAGS.filter((t) => !counts.has(t.toLowerCase())).map((name) => ({ name, count: 0 }))];
  }, [recipes]);
}

function useSetRecipe() {
  const qc = useQueryClient();
  return (r: Recipe) => qc.setQueryData<RecipesState>(KEY, (s) => (s ? { recipes: s.recipes.some((x) => x.id === r.id) ? s.recipes.map((x) => (x.id === r.id ? r : x)) : [r, ...s.recipes] } : s));
}

export function useSaveRecipe() {
  const set = useSetRecipe();
  return useMutation({
    mutationFn: ({ id, data }: { id?: string; data: RecipeData }) => (id ? api<Recipe>(`${R}/recipes/${id}`, { method: "PUT", json: data }) : api<Recipe>(`${R}/recipes`, { method: "POST", json: data })),
    onSuccess: set,
  });
}

export function usePatchRecipe() {
  const qc = useQueryClient();
  const set = useSetRecipe();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; favourite?: boolean; cooked?: true; uncook?: true; date?: string }) => api<Recipe>(`${R}/recipes/${id}`, { method: "PATCH", json: patch }),
    onMutate: ({ id, favourite }) => {
      if (favourite === undefined) return;
      qc.setQueryData<RecipesState>(KEY, (s) => (s ? { recipes: s.recipes.map((x) => (x.id === id ? { ...x, favourite } : x)) } : s));
    },
    onSuccess: set,
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`${R}/recipes/${id}`, { method: "DELETE" }),
    onSuccess: (_d, id) => {
      qc.setQueryData<RecipesState>(KEY, (s) => (s ? { recipes: s.recipes.filter((x) => x.id !== id) } : s));
      void qc.invalidateQueries({ queryKey: ["recipes", "plan"] });
    },
  });
}

// ---------------------------------------------------------------- week plan

/** Local YYYY-MM-DD (not UTC: late evening mustn't jump to tomorrow). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return addDays(iso, -((d.getDay() + 6) % 7));
}

export const today = () => isoDate(new Date());

export function usePlan(from: string, to: string) {
  return useQuery({ queryKey: ["recipes", "plan", from, to], queryFn: () => api<PlanEntry[]>(`${R}/plan?from=${from}&to=${to}`) });
}

export function usePlanMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ["recipes", "plan"] });
  return {
    add: useMutation({ mutationFn: (b: { date: string; recipeId: string | null; note?: string }) => api<PlanEntry>(`${R}/plan`, { method: "POST", json: b }), onSuccess: done }),
    move: useMutation({
      mutationFn: ({ id, date }: { id: string; date: string }) => api(`${R}/plan/${id}`, { method: "PATCH", json: { date } }),
      // Move the chip at once; the refetch confirms the order.
      onMutate: ({ id, date }) => {
        for (const [key, data] of qc.getQueriesData<PlanEntry[]>({ queryKey: ["recipes", "plan"] })) {
          if (data) qc.setQueryData(key, data.map((e) => (e.id === id ? { ...e, date, sort: 1e9 } : e)));
        }
      },
      onSettled: done,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(`${R}/plan/${id}`, { method: "DELETE" }),
      onMutate: (id) => {
        for (const [key, data] of qc.getQueriesData<PlanEntry[]>({ queryKey: ["recipes", "plan"] })) {
          if (data) qc.setQueryData(key, data.filter((e) => e.id !== id));
        }
      },
      onSettled: done,
    }),
  };
}

// ------------------------------------------------------------ ticked boxes

const tickKey = (id: string) => `cortex.recipes.ticks.${id}`;

/** Which ingredients are ticked, kept in this browser only (it's a shopping aid, not data). */
export function readTicks(id: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(tickKey(id)) ?? "[]");
  } catch {
    return [];
  }
}

export function writeTicks(id: string, ticks: string[]) {
  try {
    if (ticks.length) localStorage.setItem(tickKey(id), JSON.stringify(ticks));
    else localStorage.removeItem(tickKey(id));
  } catch {
    /* storage blocked: ticks last for this visit */
  }
}

// ------------------------------------------------------------ import draft

let pendingDraft: RecipeData | null = null;

/** Hands an imported recipe to the editor at /recipes/new (kept in memory, not the URL). */
export function setPendingDraft(d: RecipeData | null) {
  pendingDraft = d;
}
export const peekPendingDraft = () => pendingDraft;

export function useImportRecipe() {
  return useMutation({ mutationFn: (url: string) => api<RecipeData>(`${R}/import`, { method: "POST", json: { url } }) });
}
