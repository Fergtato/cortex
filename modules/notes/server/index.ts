import { entityRoutes, entityTable, type CortexServerModule } from "@cortex/core/server";

/** Notes storage: one row per page and per database (or database folder). See entityRoutes. */
export const notesServer: CortexServerModule = {
  id: "notes",
  migrations: {
    "0001_pages": entityTable("notes_pages"),
    "0002_databases": entityTable("notes_databases"),
  },
  routes: (ctx) => entityRoutes(ctx, { pages: "notes_pages", databases: "notes_databases" }),
};
