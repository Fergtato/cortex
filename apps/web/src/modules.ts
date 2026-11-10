import type { CortexModule } from "@cortex/core";
import { homeModule } from "@cortex/module-home/web";
import { notesModule } from "@cortex/module-notes/web";

/**
 * Web halves of the installed modules, in app-rail order. Home must stay
 * first: it is the landing page at `/`. Adding a module = one import + one
 * entry here (its server half goes in apps/server/src/modules.ts).
 */
export const MODULES: CortexModule[] = [homeModule, notesModule];

export const HOME_ID = homeModule.id;
