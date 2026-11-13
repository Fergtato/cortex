import { Hono } from "hono";
import { sql, type Kysely } from "kysely";
import { z } from "zod";
import { forUser, newId, type AppEnv, type CortexServerModule, type ServerContext } from "@cortex/core/server";
import { ACCOUNT_TYPES, type Account, type Budget, type Category, type FinanceState, type Rule, type Summary, type Iou, type Transaction, type TransferSuggestion } from "../shared/types";
import { findTransferPairs, pairKey, type MatchTx } from "./transfers";

/*
 * Finance: typed tables so summaries are SQL aggregates. Portable SQL only
 * (SQLite + Postgres): money is bigint minor units, dates are ISO text,
 * booleans are 0/1 integers, month = substr(date, 1, 7). Postgres returns
 * bigint/SUM as strings, so every number read back goes through num().
 */

const T = {
  accounts: "finance_accounts",
  categories: "finance_categories",
  tx: "finance_transactions",
  budgets: "finance_budgets",
  rules: "finance_rules",
  ignores: "finance_transfer_ignores",
  ious: "finance_ious",
} as const;

const num = (v: unknown) => Number(v ?? 0);
const now = () => new Date().toISOString();
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MONTH = z.string().regex(/^\d{4}-\d{2}$/);
const MONEY = z.number().int().safe();
const CURRENCY = z.string().regex(/^[A-Z]{3}$/);

// ------------------------------------------------------------- migrations

const migrations = {
  "0001_init": {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable(T.accounts)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("type", "text", (c) => c.notNull())
        .addColumn("currency", "text", (c) => c.notNull())
        .addColumn("opening_balance", "bigint", (c) => c.notNull().defaultTo(0))
        .addColumn("archived", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.accounts}_pk`, ["user_id", "id"])
        .execute();
      await db.schema
        .createTable(T.categories)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("name", "text", (c) => c.notNull())
        .addColumn("kind", "text", (c) => c.notNull())
        .addColumn("group_name", "text", (c) => c.notNull())
        .addColumn("archived", "integer", (c) => c.notNull().defaultTo(0))
        .addColumn("sort", "integer", (c) => c.notNull().defaultTo(0))
        .addPrimaryKeyConstraint(`${T.categories}_pk`, ["user_id", "id"])
        .execute();
      await db.schema
        .createTable(T.tx)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("account_id", "text", (c) => c.notNull())
        .addColumn("date", "text", (c) => c.notNull())
        .addColumn("amount", "bigint", (c) => c.notNull())
        .addColumn("payee", "text", (c) => c.notNull())
        .addColumn("notes", "text", (c) => c.notNull())
        .addColumn("category_id", "text")
        .addColumn("transfer_id", "text")
        .addColumn("source", "text", (c) => c.notNull())
        .addColumn("external_id", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addColumn("updated_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.tx}_pk`, ["user_id", "id"])
        .execute();
      await db.schema.createIndex(`${T.tx}_date_idx`).on(T.tx).columns(["user_id", "date"]).execute();
      await db.schema.createIndex(`${T.tx}_account_idx`).on(T.tx).columns(["user_id", "account_id", "date"]).execute();
      // Connector / CSV de-duplication. NULLs never collide, so manual rows are unaffected.
      await db.schema.createIndex(`${T.tx}_external_uq`).on(T.tx).columns(["user_id", "account_id", "external_id"]).unique().execute();
      await db.schema
        .createTable(T.budgets)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("category_id", "text", (c) => c.notNull())
        .addColumn("month", "text", (c) => c.notNull())
        .addColumn("amount", "bigint", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.budgets}_pk`, ["user_id", "category_id", "month"])
        .execute();
      await db.schema
        .createTable(T.rules)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("match", "text", (c) => c.notNull())
        .addColumn("category_id", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.rules}_pk`, ["user_id", "id"])
        .execute();
    },
  },
  // Suggested transfer pairs the person said aren't transfers.
  "0002_transfer_ignores": {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable(T.ignores)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("pair", "text", (c) => c.notNull())
        .addColumn("created_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.ignores}_pk`, ["user_id", "pair"])
        .execute();
    },
  },
  // Money owed to you or by you. Linked transactions (the loan going out, the repayment coming in)
  // carry iou_id and stay out of income and spending, like transfers.
  "0003_ious": {
    async up(db: Kysely<any>) {
      await db.schema
        .createTable(T.ious)
        .addColumn("user_id", "text", (c) => c.notNull())
        .addColumn("id", "text", (c) => c.notNull())
        .addColumn("person", "text", (c) => c.notNull())
        .addColumn("direction", "text", (c) => c.notNull())
        .addColumn("amount", "bigint", (c) => c.notNull())
        .addColumn("currency", "text", (c) => c.notNull())
        .addColumn("date", "text", (c) => c.notNull())
        .addColumn("note", "text", (c) => c.notNull())
        .addColumn("settled_at", "text")
        .addColumn("created_at", "text", (c) => c.notNull())
        .addPrimaryKeyConstraint(`${T.ious}_pk`, ["user_id", "id"])
        .execute();
      await db.schema.alterTable(T.tx).addColumn("iou_id", "text").execute();
    },
  },
};

// ---------------------------------------------------------------- mapping

const toAccount = (r: any): Account => ({
  id: r.id,
  name: r.name,
  type: r.type,
  currency: r.currency,
  openingBalance: num(r.opening_balance),
  archived: !!num(r.archived),
  sort: num(r.sort),
});
const toCategory = (r: any): Category => ({ id: r.id, name: r.name, kind: r.kind, group: r.group_name, archived: !!num(r.archived), sort: num(r.sort) });
const toTx = (r: any): Transaction => ({
  id: r.id,
  accountId: r.account_id,
  date: r.date,
  amount: num(r.amount),
  payee: r.payee,
  notes: r.notes,
  categoryId: r.category_id ?? null,
  transferId: r.transfer_id ?? null,
  transferAccountId: null,
  iouId: r.iou_id ?? null,
  source: r.source,
});
const toIou = (r: any): Iou => ({
  id: r.id,
  person: r.person,
  direction: r.direction,
  amount: num(r.amount),
  currency: r.currency,
  date: r.date,
  note: r.note,
  settledAt: r.settled_at ?? null,
});

export const DEFAULT_CATEGORIES: { group: string; kind: "expense" | "income"; names: string[] }[] = [
  { group: "Income", kind: "income", names: ["Salary", "Other income"] },
  { group: "Home", kind: "expense", names: ["Rent or mortgage", "Utilities", "Insurance"] },
  { group: "Food", kind: "expense", names: ["Groceries", "Eating out"] },
  { group: "Transport", kind: "expense", names: ["Fuel", "Public transport"] },
  { group: "Personal", kind: "expense", names: ["Shopping", "Health", "Subscriptions", "Entertainment"] },
  { group: "Other", kind: "expense", names: ["Gifts", "Fees", "Miscellaneous"] },
];

/** Rules match case-insensitively; the longest match wins. */
function categoryFor(payee: string, rules: { match: string; category_id: string }[]): string | null {
  const p = payee.toLowerCase();
  let best: { match: string; category_id: string } | null = null;
  for (const r of rules) {
    if (p.includes(r.match.toLowerCase()) && (!best || r.match.length > best.match.length)) best = r;
  }
  return best?.category_id ?? null;
}

const RATES_URL = process.env.FX_RATES_URL ?? "https://api.frankfurter.dev/v1/latest";
const RATE_TTL = 6 * 3600_000;
const rateCache = new Map<string, { at: number; value: { base: string; date: string; rates: Record<string, number> } }>();

const shiftDate = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ----------------------------------------------------------------- routes

function routes(ctx: ServerContext) {
  const app = new Hono<AppEnv>();
  const q = (c: { get: (k: "userId") => string }) => forUser(ctx.db, c.get("userId"));
  const bad = (msg: string) => new Response(JSON.stringify({ error: msg }), { status: 400, headers: { "content-type": "application/json" } });
  const parse = async <S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S> | Response> => {
    const body = await req.json().catch(() => undefined);
    const r = schema.safeParse(body);
    return r.success ? r.data : bad(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  };

  /** Everything small: accounts, categories, budgets, rules. */
  app.get("/state", async (c) => {
    const u = q(c);
    const state: FinanceState = {
      accounts: (await u.selectFrom(T.accounts).selectAll().orderBy("sort").orderBy("name").execute()).map(toAccount),
      categories: (await u.selectFrom(T.categories).selectAll().orderBy("sort").orderBy("name").execute()).map(toCategory),
      budgets: (await u.selectFrom(T.budgets).selectAll().execute()).map((r: any): Budget => ({ categoryId: r.category_id, month: r.month, amount: num(r.amount) })),
      rules: (await u.selectFrom(T.rules).selectAll().orderBy("created_at").execute()).map((r: any): Rule => ({ id: r.id, match: r.match, categoryId: r.category_id })),
      ious: (await u.selectFrom(T.ious).selectAll().orderBy("date", "desc").execute()).map(toIou),
    };
    return c.json(state);
  });

  /** First run: optional first account and the default category set. */
  app.post("/setup", async (c) => {
    const body = await parse(
      c.req.raw,
      z.object({
        seedCategories: z.boolean(),
        account: z.object({ name: z.string().trim().min(1).max(100), type: z.enum(ACCOUNT_TYPES), currency: CURRENCY, openingBalance: MONEY }).optional(),
      }),
    );
    if (body instanceof Response) return body;
    const uid = c.get("userId");
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      if (body.seedCategories) {
        const existing = await u.selectFrom(T.categories).select("id").limit(1).execute();
        if (!existing.length) {
          let sort = 0;
          for (const g of DEFAULT_CATEGORIES) {
            for (const name of g.names) {
              await u.insertInto(T.categories, { id: newId(), name, kind: g.kind, group_name: g.group, archived: 0, sort: sort++ }).execute();
            }
          }
        }
      }
      if (body.account) {
        const t = now();
        await u
          .insertInto(T.accounts, {
            id: newId(),
            name: body.account.name,
            type: body.account.type,
            currency: body.account.currency,
            opening_balance: body.account.openingBalance,
            archived: 0,
            sort: 0,
            created_at: t,
            updated_at: t,
          })
          .execute();
      }
    });
    return c.json({ ok: true });
  });

  // ---- accounts
  const accountBody = z.object({
    name: z.string().trim().min(1).max(100),
    type: z.enum(ACCOUNT_TYPES),
    currency: CURRENCY,
    openingBalance: MONEY,
    archived: z.boolean().optional(),
    sort: z.number().int().optional(),
  });
  app.post("/accounts", async (c) => {
    const b = await parse(c.req.raw, accountBody);
    if (b instanceof Response) return b;
    const id = newId();
    const t = now();
    await q(c)
      .insertInto(T.accounts, { id, name: b.name, type: b.type, currency: b.currency, opening_balance: b.openingBalance, archived: b.archived ? 1 : 0, sort: b.sort ?? 0, created_at: t, updated_at: t })
      .execute();
    return c.json({ id }, 201);
  });
  app.patch("/accounts/:id", async (c) => {
    const b = await parse(c.req.raw, accountBody.partial());
    if (b instanceof Response) return b;
    const set: Record<string, unknown> = { updated_at: now() };
    if (b.name !== undefined) set.name = b.name;
    if (b.type !== undefined) set.type = b.type;
    if (b.currency !== undefined) set.currency = b.currency;
    if (b.openingBalance !== undefined) set.opening_balance = b.openingBalance;
    if (b.archived !== undefined) set.archived = b.archived ? 1 : 0;
    if (b.sort !== undefined) set.sort = b.sort;
    await q(c).updateTable(T.accounts).set(set).where("id", "=", c.req.param("id")).execute();
    return c.json({ ok: true });
  });
  /** Deletes the account and its transactions; the other half of any transfer becomes a plain transaction. */
  app.delete("/accounts/:id", async (c) => {
    const uid = c.get("userId");
    const id = c.req.param("id");
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      const transfers = (await u.selectFrom(T.tx).select("transfer_id").where("account_id", "=", id).where("transfer_id", "is not", null).execute()).map((r: any) => r.transfer_id);
      for (let i = 0; i < transfers.length; i += 500) {
        await u.updateTable(T.tx).set({ transfer_id: null, updated_at: now() }).where("transfer_id", "in", transfers.slice(i, i + 500)).where("account_id", "!=", id).execute();
      }
      await u.deleteFrom(T.tx).where("account_id", "=", id).execute();
      await u.deleteFrom(T.accounts).where("id", "=", id).execute();
    });
    return c.body(null, 204);
  });

  // ---- categories
  const categoryBody = z.object({
    name: z.string().trim().min(1).max(100),
    kind: z.enum(["expense", "income"]),
    group: z.string().trim().max(100),
    archived: z.boolean().optional(),
    sort: z.number().int().optional(),
  });
  app.post("/categories", async (c) => {
    const b = await parse(c.req.raw, categoryBody);
    if (b instanceof Response) return b;
    const id = newId();
    await q(c).insertInto(T.categories, { id, name: b.name, kind: b.kind, group_name: b.group || "Other", archived: b.archived ? 1 : 0, sort: b.sort ?? 999 }).execute();
    return c.json({ id }, 201);
  });
  app.patch("/categories/:id", async (c) => {
    const b = await parse(c.req.raw, categoryBody.partial());
    if (b instanceof Response) return b;
    const set: Record<string, unknown> = {};
    if (b.name !== undefined) set.name = b.name;
    if (b.kind !== undefined) set.kind = b.kind;
    if (b.group !== undefined) set.group_name = b.group || "Other";
    if (b.archived !== undefined) set.archived = b.archived ? 1 : 0;
    if (b.sort !== undefined) set.sort = b.sort;
    if (Object.keys(set).length) await q(c).updateTable(T.categories).set(set).where("id", "=", c.req.param("id")).execute();
    return c.json({ ok: true });
  });
  /** Deletes a category: its transactions become uncategorised; its budgets and rules go too. */
  app.delete("/categories/:id", async (c) => {
    const uid = c.get("userId");
    const id = c.req.param("id");
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      await u.updateTable(T.tx).set({ category_id: null, updated_at: now() }).where("category_id", "=", id).execute();
      await u.deleteFrom(T.budgets).where("category_id", "=", id).execute();
      await u.deleteFrom(T.rules).where("category_id", "=", id).execute();
      await u.deleteFrom(T.categories).where("id", "=", id).execute();
    });
    return c.body(null, 204);
  });

  // ---- transactions
  app.get("/transactions", async (c) => {
    const p = c.req.query();
    let query = q(c).selectFrom(T.tx);
    if (p.account) query = query.where("account_id", "=", p.account);
    if (p.category === "none") query = query.where("category_id", "is", null).where("transfer_id", "is", null);
    else if (p.category) query = query.where("category_id", "=", p.category);
    if (p.from && DATE.safeParse(p.from).success) query = query.where("date", ">=", p.from);
    if (p.to && DATE.safeParse(p.to).success) query = query.where("date", "<=", p.to);
    if (p.q) {
      const like = `%${p.q.toLowerCase().replace(/[%_]/g, "")}%`;
      query = query.where((eb) => eb.or([eb(eb.fn("lower", ["payee"]), "like", like), eb(eb.fn("lower", ["notes"]), "like", like)]));
    }
    const total = num((await query.select((eb) => eb.fn.countAll().as("n")).executeTakeFirst())?.n);
    const limit = Math.min(500, Math.max(1, Number(p.limit) || 100));
    const offset = Math.max(0, Number(p.offset) || 0);
    const rows = await query.selectAll().orderBy("date", "desc").orderBy("created_at", "desc").limit(limit).offset(offset).execute();
    const items = rows.map(toTx);
    // The account on the other side of each transfer ("Transfer to Savings").
    const tids = [...new Set(items.map((t) => t.transferId).filter(Boolean))] as string[];
    const other = new Map<string, string>();
    for (let i = 0; i < tids.length; i += 500) {
      for (const r of (await q(c).selectFrom(T.tx).select(["id", "transfer_id", "account_id"]).where("transfer_id", "in", tids.slice(i, i + 500)).execute()) as any[]) {
        for (const t of items) if (t.transferId === r.transfer_id && t.id !== r.id) other.set(t.id, r.account_id);
      }
    }
    for (const t of items) t.transferAccountId = other.get(t.id) ?? null;
    return c.json({ items, total });
  });

  const txBody = z.object({
    accountId: z.string().min(1),
    date: DATE,
    amount: MONEY,
    payee: z.string().trim().max(300),
    notes: z.string().max(2000).optional(),
    categoryId: z.string().nullable().optional(),
  });
  const transferBody = z.object({
    kind: z.literal("transfer"),
    fromAccountId: z.string().min(1),
    toAccountId: z.string().min(1),
    date: DATE,
    /** Positive amount moved, in the "from" account's minor units. */
    amount: MONEY.positive(),
    /** Received amount when the currencies differ (defaults to `amount`). */
    toAmount: MONEY.positive().optional(),
    payee: z.string().trim().max(300).optional(),
  });

  app.post("/transactions", async (c) => {
    const raw = await c.req.json().catch(() => undefined);
    const uid = c.get("userId");
    const t = now();
    if (raw?.kind === "transfer") {
      const r = transferBody.safeParse(raw);
      if (!r.success) return bad(r.error.issues[0].message);
      const b = r.data;
      if (b.fromAccountId === b.toAccountId) return bad("Pick two different accounts");
      const transferId = newId();
      const label = b.payee || "Transfer";
      await ctx.db.transaction().execute(async (trx) => {
        const u = forUser(trx, uid);
        const base = { date: b.date, payee: label, notes: "", category_id: null, transfer_id: transferId, source: "manual", external_id: null, created_at: t, updated_at: t };
        await u.insertInto(T.tx, { ...base, id: newId(), account_id: b.fromAccountId, amount: -b.amount }).execute();
        await u.insertInto(T.tx, { ...base, id: newId(), account_id: b.toAccountId, amount: b.toAmount ?? b.amount }).execute();
      });
      return c.json({ transferId }, 201);
    }
    const r = txBody.safeParse(raw);
    if (!r.success) return bad(r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const b = r.data;
    const u = forUser(ctx.db, uid);
    let categoryId = b.categoryId ?? null;
    if (categoryId === null && b.payee) categoryId = categoryFor(b.payee, (await u.selectFrom(T.rules).select(["match", "category_id"]).execute()) as any);
    const id = newId();
    await u
      .insertInto(T.tx, { id, account_id: b.accountId, date: b.date, amount: b.amount, payee: b.payee, notes: b.notes ?? "", category_id: categoryId, transfer_id: null, source: "manual", external_id: null, created_at: t, updated_at: t })
      .execute();
    return c.json({ id }, 201);
  });

  app.patch("/transactions/:id", async (c) => {
    const b = await parse(c.req.raw, txBody.partial());
    if (b instanceof Response) return b;
    const set: Record<string, unknown> = { updated_at: now() };
    if (b.accountId !== undefined) set.account_id = b.accountId;
    if (b.date !== undefined) set.date = b.date;
    if (b.amount !== undefined) set.amount = b.amount;
    if (b.payee !== undefined) set.payee = b.payee;
    if (b.notes !== undefined) set.notes = b.notes;
    if (b.categoryId !== undefined) set.category_id = b.categoryId;
    const u = q(c);
    const id = c.req.param("id");
    const row: any = await u.selectFrom(T.tx).select(["transfer_id"]).where("id", "=", id).executeTakeFirst();
    if (!row) return c.json({ error: "Not found" }, 404);
    // Transfers keep both halves in step: date and payee change together; categories don't apply.
    if (row.transfer_id) {
      delete set.category_id;
      const shared: Record<string, unknown> = { updated_at: set.updated_at };
      if (set.date) shared.date = set.date;
      if (set.payee !== undefined) shared.payee = set.payee;
      await u.updateTable(T.tx).set(shared).where("transfer_id", "=", row.transfer_id).execute();
    }
    await u.updateTable(T.tx).set(set).where("id", "=", id).execute();
    return c.json({ ok: true });
  });

  /** Deleting either half of a transfer deletes both. */
  app.delete("/transactions/:id", async (c) => {
    const u = q(c);
    const id = c.req.param("id");
    const row: any = await u.selectFrom(T.tx).select(["transfer_id"]).where("id", "=", id).executeTakeFirst();
    if (row?.transfer_id) await u.deleteFrom(T.tx).where("transfer_id", "=", row.transfer_id).execute();
    else await u.deleteFrom(T.tx).where("id", "=", id).execute();
    return c.body(null, 204);
  });

  /** Set one category on many transactions (transfers are skipped). */
  app.post("/transactions/categorise", async (c) => {
    const b = await parse(c.req.raw, z.object({ ids: z.array(z.string()).max(5000), categoryId: z.string().nullable() }));
    if (b instanceof Response) return b;
    const u = q(c);
    for (let i = 0; i < b.ids.length; i += 500) {
      await u.updateTable(T.tx).set({ category_id: b.categoryId, updated_at: now() }).where("id", "in", b.ids.slice(i, i + 500)).where("transfer_id", "is", null).execute();
    }
    return c.json({ ok: true });
  });

  // ---- transfers between the person's own accounts
  const suggestions = async (uid: string, accountIds?: string[]): Promise<TransferSuggestion[]> => {
    const u = forUser(ctx.db, uid);
    const currency = new Map(((await u.selectFrom(T.accounts).select(["id", "currency"]).execute()) as any[]).map((a) => [a.id, a.currency]));
    let query = u.selectFrom(T.tx).select(["id", "account_id", "date", "amount", "payee"]).where("transfer_id", "is", null).where("iou_id", "is", null);
    // Only look near the touched accounts' dates when given (after an import).
    if (accountIds?.length) {
      const range = (await u.selectFrom(T.tx).select([(eb) => eb.fn.min("date").as("lo"), (eb) => eb.fn.max("date").as("hi")]).where("account_id", "in", accountIds).executeTakeFirst()) as any;
      if (range?.lo) query = query.where("date", ">=", shiftDate(range.lo, -3)).where("date", "<=", shiftDate(range.hi, 3));
    }
    const txs: MatchTx[] = ((await query.execute()) as any[]).map((r) => ({ id: r.id, accountId: r.account_id, currency: currency.get(r.account_id) ?? "", date: r.date, amount: num(r.amount), payee: r.payee }));
    const ignored = new Set(((await u.selectFrom(T.ignores).select("pair").execute()) as any[]).map((r) => r.pair));
    let pairs = findTransferPairs(txs, ignored);
    if (accountIds?.length) pairs = pairs.filter((p) => accountIds.includes(p.out.accountId) || accountIds.includes(p.in.accountId));
    return pairs.map((p) => ({ outId: p.out.id, inId: p.in.id, exchange: p.exchange, out: { accountId: p.out.accountId, date: p.out.date, amount: p.out.amount, payee: p.out.payee }, in: { accountId: p.in.accountId, date: p.in.date, amount: p.in.amount, payee: p.in.payee } }));
  };

  app.get("/transfers/suggestions", async (c) => c.json(await suggestions(c.get("userId"))));

  /** Links pairs as transfers: they leave income and spending, and their categories are cleared. */
  app.post("/transfers/link", async (c) => {
    const b = await parse(c.req.raw, z.object({ pairs: z.array(z.tuple([z.string(), z.string()])).min(1).max(5000) }));
    if (b instanceof Response) return b;
    const uid = c.get("userId");
    let linked = 0;
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      for (const [a, bId] of b.pairs) {
        const rows = (await u.selectFrom(T.tx).select(["id", "account_id", "amount", "transfer_id"]).where("id", "in", [a, bId]).execute()) as any[];
        if (rows.length !== 2 || rows.some((r) => r.transfer_id) || rows[0].account_id === rows[1].account_id || Math.sign(num(rows[0].amount)) === Math.sign(num(rows[1].amount))) continue;
        await u.updateTable(T.tx).set({ transfer_id: newId(), category_id: null, updated_at: now() }).where("id", "in", [a, bId]).execute();
        linked++;
      }
    });
    return c.json({ linked });
  });

  /** "Not a transfer": the pair stops being suggested. */
  app.post("/transfers/ignore", async (c) => {
    const b = await parse(c.req.raw, z.object({ pairs: z.array(z.tuple([z.string(), z.string()])).min(1).max(5000) }));
    if (b instanceof Response) return b;
    const u = q(c);
    for (const [a, bId] of b.pairs) {
      const pair = pairKey(a, bId);
      await u.deleteFrom(T.ignores).where("pair", "=", pair).execute();
      await u.insertInto(T.ignores, { pair, created_at: now() }).execute();
    }
    return c.json({ ok: true });
  });

  /** Turns a transfer back into two ordinary transactions. */
  app.post("/transfers/unlink", async (c) => {
    const b = await parse(c.req.raw, z.object({ id: z.string().min(1) }));
    if (b instanceof Response) return b;
    const u = q(c);
    const row: any = await u.selectFrom(T.tx).select("transfer_id").where("id", "=", b.id).executeTakeFirst();
    if (row?.transfer_id) {
      const ids = ((await u.selectFrom(T.tx).select("id").where("transfer_id", "=", row.transfer_id).execute()) as any[]).map((r) => r.id);
      await u.updateTable(T.tx).set({ transfer_id: null, updated_at: now() }).where("transfer_id", "=", row.transfer_id).execute();
      if (ids.length === 2) await u.insertInto(T.ignores, { pair: pairKey(ids[0], ids[1]), created_at: now() }).execute().catch(() => {});
    }
    return c.json({ ok: true });
  });

  /**
   * Marks one transaction as a transfer with another account: links it to
   * the matching opposite transaction there if one exists (±3 days), else
   * creates that other half so both balances stay right.
   */
  app.post("/transactions/:id/transfer", async (c) => {
    const b = await parse(c.req.raw, z.object({ accountId: z.string().min(1), otherAmount: MONEY.positive().optional() }));
    if (b instanceof Response) return b;
    const uid = c.get("userId");
    const id = c.req.param("id");
    const result = await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      const tx: any = await u.selectFrom(T.tx).selectAll().where("id", "=", id).executeTakeFirst();
      if (!tx) return { error: "Not found" };
      if (tx.transfer_id) return { error: "That's already a transfer." };
      if (tx.account_id === b.accountId) return { error: "Pick a different account." };
      const accts = new Map(((await u.selectFrom(T.accounts).select(["id", "currency"]).execute()) as any[]).map((a) => [a.id, a.currency]));
      if (!accts.has(b.accountId)) return { error: "Unknown account" };
      const same = accts.get(b.accountId) === accts.get(tx.account_id);
      const amount = num(tx.amount);
      const transferId = newId();
      let match: any = null;
      if (same) {
        match = await u
          .selectFrom(T.tx)
          .selectAll()
          .where("account_id", "=", b.accountId)
          .where("transfer_id", "is", null)
          .where("amount", "=", -amount)
          .where("date", ">=", shiftDate(tx.date, -3))
          .where("date", "<=", shiftDate(tx.date, 3))
          .orderBy("date")
          .executeTakeFirst();
      }
      const t = now();
      await u.updateTable(T.tx).set({ transfer_id: transferId, category_id: null, updated_at: t }).where("id", "=", id).execute();
      if (match) {
        await u.updateTable(T.tx).set({ transfer_id: transferId, category_id: null, updated_at: t }).where("id", "=", match.id).execute();
        return { linked: match.id };
      }
      if (!same && !b.otherAmount) return { error: "Enter the amount in the other account's currency." };
      const otherAmount = same ? -amount : Math.sign(-amount) * b.otherAmount!;
      await u
        .insertInto(T.tx, { id: newId(), account_id: b.accountId, date: tx.date, amount: otherAmount, payee: tx.payee, notes: "", category_id: null, transfer_id: transferId, source: "manual", external_id: null, created_at: t, updated_at: t })
        .execute();
      return { created: true };
    });
    if ("error" in result) return bad(result.error as string);
    return c.json(result);
  });

  // ---- IOUs
  const iouBody = z.object({
    person: z.string().trim().min(1).max(100),
    direction: z.enum(["owed_to_me", "i_owe"]),
    amount: MONEY.positive(),
    currency: CURRENCY,
    date: DATE,
    note: z.string().max(500).optional(),
    /** Record the money leaving (owed to me) or arriving (I owe) in this account. */
    accountId: z.string().optional(),
  });
  app.post("/ious", async (c) => {
    const b = await parse(c.req.raw, iouBody);
    if (b instanceof Response) return b;
    const id = newId();
    const t = now();
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, c.get("userId"));
      await u.insertInto(T.ious, { id, person: b.person, direction: b.direction, amount: b.amount, currency: b.currency, date: b.date, note: b.note ?? "", settled_at: null, created_at: t }).execute();
      if (b.accountId) {
        const sign = b.direction === "owed_to_me" ? -1 : 1;
        await u
          .insertInto(T.tx, { id: newId(), account_id: b.accountId, date: b.date, amount: sign * b.amount, payee: b.direction === "owed_to_me" ? `Lent to ${b.person}` : `Borrowed from ${b.person}`, notes: b.note ?? "", category_id: null, transfer_id: null, iou_id: id, source: "manual", external_id: null, created_at: t, updated_at: t })
          .execute();
      }
    });
    return c.json({ id }, 201);
  });
  app.patch("/ious/:id", async (c) => {
    const b = await parse(c.req.raw, iouBody.omit({ accountId: true }).partial());
    if (b instanceof Response) return b;
    const set: Record<string, unknown> = {};
    for (const [k, col] of [["person", "person"], ["direction", "direction"], ["amount", "amount"], ["currency", "currency"], ["date", "date"], ["note", "note"]] as const) if (b[k] !== undefined) set[col] = b[k];
    if (Object.keys(set).length) await q(c).updateTable(T.ious).set(set).where("id", "=", c.req.param("id")).execute();
    return c.json({ ok: true });
  });
  /**
   * Settles an IOU: link an existing transaction (the repayment), or record a
   * new one in an account, or just mark it settled. Linked rows leave income/spending.
   */
  app.post("/ious/:id/settle", async (c) => {
    const b = await parse(c.req.raw, z.object({ transactionId: z.string().optional(), accountId: z.string().optional(), date: DATE.optional() }));
    if (b instanceof Response) return b;
    const id = c.req.param("id");
    const t = now();
    const result = await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, c.get("userId"));
      const iou: any = await u.selectFrom(T.ious).selectAll().where("id", "=", id).executeTakeFirst();
      if (!iou) return "Not found";
      const date = b.date ?? new Date().toISOString().slice(0, 10);
      if (b.transactionId) {
        await u.updateTable(T.tx).set({ iou_id: id, category_id: null, updated_at: t }).where("id", "=", b.transactionId).where("transfer_id", "is", null).execute();
      } else if (b.accountId) {
        const sign = iou.direction === "owed_to_me" ? 1 : -1;
        await u
          .insertInto(T.tx, { id: newId(), account_id: b.accountId, date, amount: sign * num(iou.amount), payee: iou.direction === "owed_to_me" ? `Repaid by ${iou.person}` : `Repaid ${iou.person}`, notes: iou.note, category_id: null, transfer_id: null, iou_id: id, source: "manual", external_id: null, created_at: t, updated_at: t })
          .execute();
      }
      await u.updateTable(T.ious).set({ settled_at: date }).where("id", "=", id).execute();
      return null;
    });
    if (result) return bad(result);
    return c.json({ ok: true });
  });
  app.post("/ious/:id/reopen", async (c) => {
    await q(c).updateTable(T.ious).set({ settled_at: null }).where("id", "=", c.req.param("id")).execute();
    return c.json({ ok: true });
  });
  /** Deletes an IOU; linked transactions stay, as ordinary transactions. */
  app.delete("/ious/:id", async (c) => {
    const u = q(c);
    await u.updateTable(T.tx).set({ iou_id: null, updated_at: now() }).where("iou_id", "=", c.req.param("id")).execute();
    await u.deleteFrom(T.ious).where("id", "=", c.req.param("id")).execute();
    return c.body(null, 204);
  });

  // ---- budgets
  app.put("/budgets", async (c) => {
    const b = await parse(c.req.raw, z.object({ categoryId: z.string().min(1), month: z.union([MONTH, z.literal("*")]), amount: MONEY.nonnegative().nullable() }));
    if (b instanceof Response) return b;
    const u = q(c);
    await u.deleteFrom(T.budgets).where("category_id", "=", b.categoryId).where("month", "=", b.month).execute();
    if (b.amount !== null) await u.insertInto(T.budgets, { category_id: b.categoryId, month: b.month, amount: b.amount }).execute();
    return c.json({ ok: true });
  });

  // ---- rules
  app.post("/rules", async (c) => {
    const b = await parse(c.req.raw, z.object({ match: z.string().trim().min(2).max(200), categoryId: z.string().min(1), applyToExisting: z.boolean().optional() }));
    if (b instanceof Response) return b;
    const u = q(c);
    const id = newId();
    await u.insertInto(T.rules, { id, match: b.match, category_id: b.categoryId, created_at: now() }).execute();
    let updated = 0;
    if (b.applyToExisting) {
      const like = `%${b.match.toLowerCase().replace(/[%_]/g, "")}%`;
      const res = await u
        .updateTable(T.tx)
        .set({ category_id: b.categoryId, updated_at: now() })
        .where("category_id", "is", null)
        .where("transfer_id", "is", null)
        .where((eb) => eb(eb.fn("lower", ["payee"]), "like", like))
        .executeTakeFirst();
      updated = num(res.numUpdatedRows);
    }
    return c.json({ id, updated }, 201);
  });
  app.delete("/rules/:id", async (c) => {
    await q(c).deleteFrom(T.rules).where("id", "=", c.req.param("id")).execute();
    return c.body(null, 204);
  });

  // ---- exchange rates (ECB reference rates via Frankfurter; no key, cached)
  app.get("/rates", async (c) => {
    const base = CURRENCY.safeParse(c.req.query("base")).success ? c.req.query("base")! : "EUR";
    const hit = rateCache.get(base);
    if (hit && Date.now() - hit.at < RATE_TTL) return c.json(hit.value);
    try {
      const res = await ctx.outbound(`${RATES_URL}?from=${base}`, { accept: "application/json" });
      if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
      const j = res.json<{ base: string; date: string; rates: Record<string, number> }>();
      const value = { base, date: j.date, rates: { ...j.rates, [base]: 1 } };
      rateCache.set(base, { at: Date.now(), value });
      return c.json(value);
    } catch (e) {
      if (hit) return c.json(hit.value);
      return c.json({ error: `Couldn't fetch exchange rates: ${(e as Error).message}` }, 502);
    }
  });

  // ---- summary
  app.get("/summary", async (c) => {
    const month = MONTH.safeParse(c.req.query("month")).success ? c.req.query("month")! : new Date().toISOString().slice(0, 7);
    const months = Math.min(36, Math.max(1, Number(c.req.query("months")) || 6));
    const uid = c.get("userId");
    const u = q(c);
    const [y, m] = month.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - months, 1)).toISOString().slice(0, 7);
    const monthExpr = sql<string>`substr(t.date, 1, 7)`;
    const joined = () =>
      ctx.db
        .selectFrom(`${T.tx} as t`)
        .innerJoin(`${T.accounts} as a`, (j) => j.onRef("a.id", "=", "t.account_id").onRef("a.user_id", "=", "t.user_id"))
        .where("t.user_id", "=", uid);

    const balances = (await u.selectFrom(T.tx).select(["account_id", (eb) => eb.fn.sum("amount").as("s")]).groupBy("account_id").execute()) as any[];
    const accounts = (await u.selectFrom(T.accounts).select(["id", "opening_balance"]).execute()) as any[];
    const sums = new Map(balances.map((r) => [r.account_id, num(r.s)]));

    const totals = (await joined()
      .where("t.transfer_id", "is", null)
      .where("t.iou_id", "is", null)
      .where(monthExpr, "=", month)
      .select([
        "a.currency as currency",
        sql<number>`sum(case when t.amount > 0 then t.amount else 0 end)`.as("income"),
        sql<number>`sum(case when t.amount < 0 then t.amount else 0 end)`.as("expense"),
      ])
      .groupBy("a.currency")
      .execute()) as any[];

    const byCategory = (await joined()
      .where("t.transfer_id", "is", null)
      .where("t.iou_id", "is", null)
      .where(monthExpr, "=", month)
      .select(["a.currency as currency", "t.category_id as category_id", (eb) => eb.fn.sum("t.amount").as("amount")])
      .groupBy(["a.currency", "t.category_id"])
      .execute()) as any[];

    const trend = (await joined()
      .where("t.transfer_id", "is", null)
      .where("t.iou_id", "is", null)
      .where(monthExpr, ">", start)
      .where(monthExpr, "<=", month)
      .select([
        "a.currency as currency",
        monthExpr.as("month"),
        sql<number>`sum(case when t.amount > 0 then t.amount else 0 end)`.as("income"),
        sql<number>`sum(case when t.amount < 0 then t.amount else 0 end)`.as("expense"),
      ])
      .groupBy(["a.currency", monthExpr])
      .orderBy(monthExpr)
      .execute()) as any[];

    const summary: Summary = {
      month,
      balances: accounts.map((a) => ({ accountId: a.id, balance: num(a.opening_balance) + (sums.get(a.id) ?? 0) })),
      totals: totals.map((r) => ({ currency: r.currency, income: num(r.income), expense: num(r.expense) })),
      byCategory: byCategory.map((r) => ({ currency: r.currency, categoryId: r.category_id ?? null, amount: num(r.amount) })),
      trend: trend.map((r) => ({ currency: r.currency, month: r.month, income: num(r.income), expense: num(r.expense) })),
    };
    return c.json(summary);
  });

  // ---- CSV import (rows parsed and mapped in the browser; may span several accounts)
  const importBody = z.object({
    rows: z
      .array(
        z.object({
          accountId: z.string().min(1),
          date: DATE,
          amount: MONEY,
          payee: z.string().max(300),
          externalId: z.string().min(1).max(200),
          /** Grouped rows (monthly interest) are updated in place when re-imported. */
          upsert: z.boolean().optional(),
        }),
      )
      .max(50000),
    /** Bank balance after a given row: the account's opening balance is set so Cortex agrees. */
    balances: z.array(z.object({ accountId: z.string().min(1), balance: MONEY, afterIds: z.array(z.string()).max(50000) })).max(50).optional(),
    dryRun: z.boolean().optional(),
  });

  app.post("/import", async (c) => {
    const b = await parse(c.req.raw, importBody);
    if (b instanceof Response) return b;
    const uid = c.get("userId");
    const accountIds = [...new Set(b.rows.map((r) => r.accountId))];
    const u0 = forUser(ctx.db, uid);
    const known = new Set(((await u0.selectFrom(T.accounts).select("id").execute()) as any[]).map((a) => a.id));
    if (accountIds.some((id) => !known.has(id))) return bad("Unknown account");

    // Which rows are already there (per account).
    const existing = new Map<string, { id: string; amount: number; date: string; payee: string }>();
    for (const accountId of accountIds) {
      const ids = b.rows.filter((r) => r.accountId === accountId).map((r) => r.externalId);
      for (let i = 0; i < ids.length; i += 500) {
        const found = (await u0.selectFrom(T.tx).select(["id", "external_id", "amount", "date", "payee"]).where("account_id", "=", accountId).where("external_id", "in", ids.slice(i, i + 500)).execute()) as any[];
        for (const f of found) existing.set(`${accountId}|${f.external_id}`, { id: f.id, amount: num(f.amount), date: f.date, payee: f.payee });
      }
    }
    if (b.dryRun) return c.json({ existing: [...existing.keys()] });

    let inserted = 0;
    let updated = 0;
    let categorised = 0;
    const balanceChanges: { accountId: string; from: number; to: number }[] = [];
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      const rules = (await u.selectFrom(T.rules).select(["match", "category_id"]).execute()) as any[];
      const t = now();
      const seen = new Set<string>();
      for (const r of b.rows) {
        const key = `${r.accountId}|${r.externalId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ex = existing.get(key);
        if (ex) {
          if (r.upsert && (ex.amount !== r.amount || ex.date !== r.date || ex.payee !== r.payee)) {
            await u.updateTable(T.tx).set({ amount: r.amount, date: r.date, payee: r.payee, updated_at: t }).where("id", "=", ex.id).execute();
            updated++;
          }
          continue;
        }
        const categoryId = categoryFor(r.payee, rules);
        if (categoryId) categorised++;
        await u
          .insertInto(T.tx, { id: newId(), account_id: r.accountId, date: r.date, amount: r.amount, payee: r.payee, notes: "", category_id: categoryId, transfer_id: null, source: "csv", external_id: r.externalId, created_at: t, updated_at: t })
          .execute();
        inserted++;
      }
      // Balance sync: opening = bank balance − (everything in the account − rows the file lists after that balance).
      for (const bal of b.balances ?? []) {
        if (!accountIds.includes(bal.accountId)) continue;
        const total = num((await u.selectFrom(T.tx).select((eb) => eb.fn.sum("amount").as("s")).where("account_id", "=", bal.accountId).executeTakeFirst() as any)?.s);
        let after = 0;
        for (let i = 0; i < bal.afterIds.length; i += 500) {
          after += num((await u.selectFrom(T.tx).select((eb) => eb.fn.sum("amount").as("s")).where("account_id", "=", bal.accountId).where("external_id", "in", bal.afterIds.slice(i, i + 500)).executeTakeFirst() as any)?.s);
        }
        const acct: any = await u.selectFrom(T.accounts).select("opening_balance").where("id", "=", bal.accountId).executeTakeFirst();
        const opening = bal.balance - (total - after);
        if (num(acct.opening_balance) !== opening) {
          await u.updateTable(T.accounts).set({ opening_balance: opening, updated_at: t }).where("id", "=", bal.accountId).execute();
          balanceChanges.push({ accountId: bal.accountId, from: num(acct.opening_balance), to: opening });
        }
      }
    });
    const transfers = (await suggestions(uid, accountIds)).length;
    return c.json({ inserted, updated, skipped: b.rows.length - inserted - updated, categorised, balanceChanges, transfers });
  });

  // ---- backup (Settings → Backup)
  app.get("/backup", async (c) => {
    const u = q(c);
    const all = async (table: string) => (await u.selectFrom(table).selectAll().execute()).map(({ user_id: _u, ...rest }: any) => rest);
    return c.json({ accounts: await all(T.accounts), categories: await all(T.categories), transactions: await all(T.tx), budgets: await all(T.budgets), rules: await all(T.rules), transferIgnores: await all(T.ignores), ious: await all(T.ious) });
  });

  app.post("/backup", async (c) => {
    const b = await c.req.json().catch(() => null);
    if (!b || (b.mode !== "merge" && b.mode !== "replace") || typeof b.data !== "object") return bad("Expected { mode, data }");
    const uid = c.get("userId");
    const tables: [string, string, string[]][] = [
      ["accounts", T.accounts, ["id"]],
      ["categories", T.categories, ["id"]],
      ["transactions", T.tx, ["id"]],
      ["budgets", T.budgets, ["category_id", "month"]],
      ["rules", T.rules, ["id"]],
      ["transferIgnores", T.ignores, ["pair"]],
      ["ious", T.ious, ["id"]],
    ];
    const counts: Record<string, number> = {};
    await ctx.db.transaction().execute(async (trx) => {
      const u = forUser(trx, uid);
      if (b.mode === "replace") for (const [, table] of tables) await u.deleteFrom(table).execute();
      for (const [key, table, pk] of tables) {
        const rows = Array.isArray(b.data[key]) ? b.data[key] : [];
        counts[key] = rows.length;
        for (const row of rows) {
          if (!row || typeof row !== "object") continue;
          const { user_id: _u, ...values } = row;
          let del = u.deleteFrom(table);
          for (const k of pk) del = del.where(k as any, "=", values[k]);
          await del.execute();
          await u.insertInto(table, values).execute();
        }
      }
    });
    return c.json({ ok: true, counts });
  });

  return app;
}

export const financeServer: CortexServerModule = { id: "finance", migrations, routes };
