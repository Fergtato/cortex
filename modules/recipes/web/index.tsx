import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, PageFrame, type CortexModule, type ModuleBackup, type ModuleViewProps, type WidgetDef, type WidgetProps } from "@cortex/core";
import { useRecipes } from "./data";

/*
 * Recipes: a cookbook laid out like recipe cards (ingredients with tick
 * boxes, steps as blocks, a cooking timeline), tags, and a week plan.
 * Views and widgets are lazy so Home stays light.
 */

const views = () => import("./views");
const LazySidebar = lazy(() => views().then((m) => ({ default: m.RecipesSidebar })));
const LazyPage = lazy(() => views().then((m) => ({ default: m.RecipesPage })));

function withSuspense<P extends object>(C: ComponentType<P>, fallback: ReactNode = null) {
  return (props: P) => (
    <Suspense fallback={fallback}>
      <C {...props} />
    </Suspense>
  );
}

type W = typeof import("./widgets");
const L = (name: keyof W) => lazy(() => import("./widgets").then((m) => ({ default: m[name] as ComponentType<WidgetProps> })));

const widgets: WidgetDef[] = [
  { type: "recipes.week", label: "This week's meals", icon: "calendar", defaultSize: { w: 4, h: 3 }, defaultConfig: {}, Component: L("WeekWidget") },
  { type: "recipes.tonight", label: "Tonight", icon: "pot", defaultSize: { w: 4, h: 3 }, defaultConfig: {}, Component: L("TonightWidget") },
];

interface RecipesBackup {
  recipes?: unknown[];
  plan?: unknown[];
}

const backup: ModuleBackup = {
  useBackup: () => {
    const q = useRecipes();
    const qc = useQueryClient();
    return {
      ready: q.isSuccess,
      summary: q.data ? `${q.data.recipes.length} recipes` : "",
      exportData: () => api<RecipesBackup>("/recipes/backup"),
      importData: async (data, mode) => {
        await api("/recipes/backup", { method: "POST", json: { mode, data } });
        await qc.invalidateQueries({ queryKey: ["recipes"] });
      },
    };
  },
  describe: (data) => {
    const d = data as RecipesBackup;
    return `${d?.recipes?.length ?? 0} recipes · ${d?.plan?.length ?? 0} planned meals`;
  },
};

export const recipesModule: CortexModule = {
  id: "recipes",
  name: "Recipes",
  icon: "pot",
  Sidebar: withSuspense<ModuleViewProps>(LazySidebar, <aside className="cx-side" />),
  Page: withSuspense<ModuleViewProps>(LazyPage, <PageFrame crumbs={["Recipes"]} />),
  widgets,
  backup,
};
