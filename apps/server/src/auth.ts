import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { getMigrations } from "better-auth/db/migration";
import { admin } from "better-auth/plugins";
import type { Kysely } from "kysely";
import { config } from "./config";
import type { Dialect } from "./db";

/** Number of accounts on this instance (Better Auth's `user` table). */
export async function countUsers(db: Kysely<any>): Promise<number> {
  const row = await db.selectFrom("user").select((eb) => eb.fn.countAll().as("n")).executeTakeFirst();
  return Number(row?.n ?? 0);
}

/**
 * Accounts and sessions. Self-host default: the first sign-up creates the
 * admin, after which public sign-up is closed and the admin adds people from
 * Settings (admin plugin `createUser`). `ALLOW_SIGNUP=true` opens it (hosted).
 */
export function createAuth(db: Kysely<any>, dialect: Dialect) {
  return betterAuth({
    database: { db, type: dialect },
    secret: config.secret,
    baseURL: config.publicUrl,
    basePath: "/api/auth",
    // With no public URL configured (LAN install), accept the origin the request was made to.
    trustedOrigins: config.publicUrl
      ? [config.publicUrl]
      : (request) => (request ? [new URL(request.url).origin] : []),
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // migrateAuth() brings the schema up to date before the server listens, so
    // the startup check would only log a scary (false) mismatch on first boot.
    advanced: { database: { validateSchema: false } },
    plugins: [admin()],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || config.allowSignup) return;
        if ((await countUsers(db)) > 0) {
          throw new APIError("FORBIDDEN", { message: "Sign-up is closed. Ask the admin for an account." });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if ((await countUsers(db)) === 0) return { data: { ...user, role: "admin" } };
            return { data: user };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export async function migrateAuth(auth: Auth): Promise<void> {
  const { runMigrations, toBeCreated, toBeAdded } = await getMigrations(auth.options);
  if (toBeCreated.length || toBeAdded.length) {
    console.log(`[migrate] auth: ${toBeCreated.map((t) => t.table).join(", ") || "columns"}`);
    await runMigrations();
  }
}
