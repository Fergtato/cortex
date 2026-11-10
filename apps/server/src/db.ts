import { join } from "node:path";
import Database from "better-sqlite3";
import { Kysely, PostgresDialect, SqliteDialect } from "kysely";
import pg from "pg";
import { config } from "./config";

export type Dialect = "sqlite" | "postgres";

export function createDb(): { db: Kysely<any>; dialect: Dialect } {
  if (config.databaseUrl) {
    const pool = new pg.Pool({ connectionString: config.databaseUrl });
    return { db: new Kysely<any>({ dialect: new PostgresDialect({ pool }) }), dialect: "postgres" };
  }
  const sqlite = new Database(join(config.dataDir, "cortex.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return { db: new Kysely<any>({ dialect: new SqliteDialect({ database: sqlite }) }), dialect: "sqlite" };
}
