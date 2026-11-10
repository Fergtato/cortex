import type { Kysely } from "kysely";
import { Migrator, type Migration } from "kysely/migration";
import type { CortexServerModule } from "@cortex/core/server";

/*
 * Portable SQL only: every migration here and in modules must run on SQLite
 * AND Postgres. Use text (ids, ISO timestamps, JSON), integer/bigint (money
 * in minor units), real, boolean-as-integer. No jsonb, arrays, enums,
 * `returning` tricks, or dialect-specific defaults.
 */
const coreMigrations: Record<string, Migration> = {
  "0001_init": {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable("user_settings")
        .addColumn("user_id", "text", (c) => c.primaryKey())
        .addColumn("data", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .execute();

      await db.schema
        .createTable("files")
        .addColumn("id", "text", (c) => c.primaryKey())
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("type", "text", (c) => c.notNull())
        .addColumn("size", "bigint", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .execute();
      await db.schema.createIndex("files_user_idx").on("files").column("user_id").execute();

      // Cross-module links (recipe ↔ meal-plan note, outfit ↔ calendar day…).
      await db.schema
        .createTable("links")
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("src_module", "text", (c) => c.notNull())
        .addColumn("src_id", "text", (c) => c.notNull())
        .addColumn("dst_module", "text", (c) => c.notNull())
        .addColumn("dst_id", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint("links_pk", ["user_id", "src_module", "src_id", "dst_module", "dst_id"])
        .execute();
      await db.schema.createIndex("links_dst_idx").on("links").columns(["user_id", "dst_module", "dst_id"]).execute();
    },
  },
};

/** Runs core migrations, then each module's (prefixed `<module>_`) in registry order. */
export async function migrate(db: Kysely<any>, modules: CortexServerModule[]): Promise<void> {
  const all: Record<string, Migration> = {};
  for (const [k, m] of Object.entries(coreMigrations)) all[`core_${k}`] = m;
  for (const mod of modules) {
    for (const [k, m] of Object.entries(mod.migrations ?? {})) all[`${mod.id}_${k}`] = m;
  }
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => all },
    migrationTableName: "cortex_migrations",
    migrationLockTableName: "cortex_migrations_lock",
    // Names sort by module, so a module added later sorts "before" ones that
    // already ran. That's expected here, not an error.
    allowUnorderedMigrations: true,
  });
  const { error, results } = await migrator.migrateToLatest();
  for (const r of results ?? []) {
    if (r.status === "Success") console.log(`[migrate] applied ${r.migrationName}`);
    if (r.status === "Error") console.error(`[migrate] FAILED ${r.migrationName}`);
  }
  if (error) throw error;
}
