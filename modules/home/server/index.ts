import { entityRoutes, entityTable, type CortexServerModule } from "@cortex/core/server";

/** Home storage: one row per dashboard (or dashboard folder). See entityRoutes. */
export const homeServer: CortexServerModule = {
  id: "home",
  migrations: { "0001_dashboards": entityTable("home_dashboards") },
  routes: (ctx) => entityRoutes(ctx, { dashboards: "home_dashboards" }),
};
