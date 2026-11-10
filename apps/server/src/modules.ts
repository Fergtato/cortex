import type { CortexServerModule } from "@cortex/core/server";
import { homeServer } from "@cortex/module-home/server";
import { notesServer } from "@cortex/module-notes/server";

/**
 * Server halves of the installed modules. Adding a module with a backend =
 * one import + one entry here (its web half goes in apps/web/src/modules.ts).
 * Order matters only for migrations: a module's tables exist before later ones'.
 */
export const SERVER_MODULES: CortexServerModule[] = [notesServer, homeServer];
