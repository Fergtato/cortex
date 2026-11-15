import type { ReactNode } from "react";
import { WidgetRegistryProvider, type CortexModule } from "@cortex/core";
import { financeModule } from "@cortex/module-finance/web";
import { homeModule } from "@cortex/module-home/web";
import { notesModule } from "@cortex/module-notes/web";
import { recipesModule } from "@cortex/module-recipes/web";
import { watchlistModule } from "@cortex/module-watchlist/web";

/**
 * Web halves of the installed modules, in app-rail order. Home must stay
 * first: it is the landing page at `/`. Adding a module = one import + one
 * entry here (its server half goes in apps/server/src/modules.ts).
 */
export const MODULES: CortexModule[] = [homeModule, notesModule, financeModule, watchlistModule, recipesModule];

export const HOME_ID = homeModule.id;

/** Modules in the person's chosen rail order (Settings → Apps); unknown ids are ignored, new apps go last. */
export function orderModules(order: string[] | undefined): CortexModule[] {
  if (!order?.length) return MODULES;
  const rank = new Map(order.map((id, i) => [id, i]));
  return MODULES.map((m, i) => ({ m, i })).sort((a, b) => (rank.get(a.m.id) ?? 1e6 + a.i) - (rank.get(b.m.id) ?? 1e6 + b.i)).map((x) => x.m);
}

const WIDGETS = MODULES.flatMap((m) => m.widgets ?? []);

/** Nests every module's Provider around the app (registry order) inside the widget registry. */
export function ModuleProviders({ children }: { children: ReactNode }) {
  return (
    <WidgetRegistryProvider defs={WIDGETS}>
      {MODULES.reduceRight<ReactNode>((inner, m) => (m.Provider ? <m.Provider>{inner}</m.Provider> : inner), children)}
    </WidgetRegistryProvider>
  );
}
