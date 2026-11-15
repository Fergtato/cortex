import { z } from "zod";
import { forUser, type ServerContext } from "@cortex/core/server";

/*
 * AI category suggestions. Uncategorised transactions are grouped by payee
 * (refs and card numbers stripped) and direction; the model sees only payee
 * names, counts, money in/out and the person's category list, and answers
 * with a category id per payee. Nothing is changed until the person applies.
 */

export interface CategorySuggestion {
  payee: string;
  direction: "in" | "out";
  categoryId: string | null;
  ids: string[];
  total: number;
}

const MAX_PAYEES = 200;

/** "TESCO STORES 3021 LONDON GB" and "Tesco Stores 1187" → "tesco stores london gb"/"tesco stores". */
export const payeeKey = (p: string) =>
  p
    .toLowerCase()
    .replace(/\b(card|pos|contactless|visa|debit|ref|payment to|payment from)\b/g, " ")
    .replace(/[*#]+/g, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const reply = z.object({ results: z.array(z.object({ payee: z.string(), categoryId: z.string().nullable().optional() })) });

export async function suggestCategories(ctx: ServerContext, uid: string, ids: string[] | undefined, signal?: AbortSignal): Promise<{ suggestions: CategorySuggestion[]; more: number }> {
  const u = forUser(ctx.db, uid);
  let q = u.selectFrom("finance_transactions").select(["id", "payee", "amount"]).where("category_id", "is", null).where("transfer_id", "is", null).where("iou_id", "is", null);
  if (ids?.length) q = q.where("id", "in", ids.slice(0, 5000));
  const rows = (await q.orderBy("date", "desc").limit(5000).execute()) as { id: string; payee: string; amount: unknown }[];
  const cats = ((await u.selectFrom("finance_categories").select(["id", "name", "kind", "group_name", "archived"]).execute()) as any[]).filter((c) => !Number(c.archived));
  if (!rows.length || !cats.length) return { suggestions: [], more: 0 };

  const groups = new Map<string, { names: Map<string, number>; direction: "in" | "out"; ids: string[]; total: number }>();
  for (const r of rows) {
    const amount = Number(r.amount);
    const direction: "in" | "out" = amount > 0 ? "in" : "out";
    const k = `${direction}|${payeeKey(r.payee) || r.payee.toLowerCase()}`;
    const g = groups.get(k) ?? { names: new Map<string, number>(), direction, ids: [] as string[], total: 0 };
    g.names.set(r.payee, (g.names.get(r.payee) ?? 0) + 1);
    g.ids.push(r.id);
    g.total += amount;
    groups.set(k, g);
  }
  const all = [...groups.values()]
    .map((g) => ({ payee: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0][0], direction: g.direction, ids: g.ids, total: g.total }))
    .sort((a, b) => b.ids.length - a.ids.length);
  const batch = all.slice(0, MAX_PAYEES);

  const system = `You file bank transactions into categories for Cortex, a personal finance app. For each payee, choose the single best category id from the list, or null if you genuinely can't tell (a person's name, a vague reference). Money going "out" must use an "expense" category; money coming "in" must use an "income" category. Reply as JSON: {"results":[{"payee":"exact payee text","categoryId":"id or null"}]}.`;
  const payload = {
    categories: cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind, group: c.group_name })),
    payees: batch.map((p) => ({ payee: p.payee, direction: p.direction, count: p.ids.length })),
  };
  const out = await ctx.ai.json(uid, { system, messages: [{ role: "user", content: `Categorise these payees.\n${JSON.stringify(payload)}` }], maxTokens: 8000, temperature: 0 }, (v) => reply.parse(v), signal);

  const byPayee = new Map(out.results.map((r) => [r.payee.trim().toLowerCase(), r.categoryId ?? null]));
  const kind = new Map(cats.map((c) => [c.id, c.kind]));
  const suggestions = batch.map((p) => {
    const id = byPayee.get(p.payee.trim().toLowerCase()) ?? null;
    const ok = id && kind.get(id) === (p.direction === "in" ? "income" : "expense");
    return { ...p, categoryId: ok ? id : null };
  });
  return { suggestions, more: Math.max(0, all.length - batch.length) };
}
