/*
 * Finds transactions that are really one transfer between two of the
 * person's accounts: money leaving one account and arriving in another.
 *
 * Same currency: exactly opposite amounts, different accounts, at most
 * three days apart. Different currencies (an exchange): opposite signs on
 * the same or next day, and one side's payee names the exchange (Revolut's
 * "Exchanged to JPY"). Pairs are greedy by
 * score, so each transaction is used once. Nothing is linked here; the
 * caller shows these for review.
 */

export interface MatchTx {
  id: string;
  accountId: string;
  currency: string;
  date: string;
  amount: number;
  payee: string;
}

export interface TransferPair {
  out: MatchTx;
  in: MatchTx;
  score: number;
  exchange: boolean;
}

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY;
const TRANSFERISH = /\b(transfer|pocket|savings?|exchang|top.?up|move|internal|from|to)\b/i;

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function findTransferPairs(txs: MatchTx[], ignored: Set<string> = new Set()): TransferPair[] {
  const outs = txs.filter((t) => t.amount < 0);
  const ins = txs.filter((t) => t.amount > 0);
  // Index money-in by |amount| for the common same-currency case.
  const byAmount = new Map<number, MatchTx[]>();
  for (const t of ins) {
    const list = byAmount.get(t.amount) ?? [];
    list.push(t);
    byAmount.set(t.amount, list);
  }
  const inByDate = new Map<string, MatchTx[]>();
  for (const t of ins) {
    const list = inByDate.get(t.date) ?? [];
    list.push(t);
    inByDate.set(t.date, list);
  }

  const candidates: TransferPair[] = [];
  for (const o of outs) {
    for (const i of byAmount.get(-o.amount) ?? []) {
      if (i.accountId === o.accountId || i.currency !== o.currency || ignored.has(pairKey(o.id, i.id))) continue;
      const gap = days(o.date, i.date);
      if (gap > 3) continue;
      let score = 100 - gap * 20;
      if (TRANSFERISH.test(o.payee)) score += 5;
      if (TRANSFERISH.test(i.payee)) score += 5;
      candidates.push({ out: o, in: i, score, exchange: false });
    }
    // Exchanges: different currencies, so amounts can't be compared; lean on dates and wording.
    const exOut = /exchang/i.test(o.payee);
    for (const d of [o.date, shift(o.date, 1)]) {
      for (const i of inByDate.get(d) ?? []) {
        if (i.accountId === o.accountId || i.currency === o.currency || ignored.has(pairKey(o.id, i.id))) continue;
        const exIn = /exchang/i.test(i.payee);
        const named = new RegExp(`\\b(${i.currency}|${o.currency})\\b`).test(`${o.payee} ${i.payee}`);
        if (!exOut && !exIn) continue;
        let score = 60 - days(o.date, i.date) * 20;
        if (exOut && exIn) score += 20;
        if (named) score += 15;
        candidates.push({ out: o, in: i, score, exchange: true });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.out.date.localeCompare(b.out.date));
  const used = new Set<string>();
  const pairs: TransferPair[] = [];
  for (const c of candidates) {
    if (used.has(c.out.id) || used.has(c.in.id)) continue;
    used.add(c.out.id);
    used.add(c.in.id);
    pairs.push(c);
  }
  return pairs.sort((a, b) => b.out.date.localeCompare(a.out.date));
}

function shift(date: string, n: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}
