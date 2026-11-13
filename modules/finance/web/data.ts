import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, useModulePrefs } from "@cortex/core";
import type { Account, Category, FinanceState, Rates, Summary, Transaction, TransferSuggestion } from "../shared/types";

/*
 * Finance data on the client: TanStack Query over /api/finance. Every write
 * invalidates the whole ["finance"] key, so balances, summaries and lists
 * stay consistent without hand-maintained caches.
 */

const KEY = ["finance"] as const;

export function useFinanceState() {
  return useQuery({ queryKey: [...KEY, "state"], queryFn: () => api<FinanceState>("/finance/state") });
}

export function useSummary(month: string, months = 6) {
  return useQuery({ queryKey: [...KEY, "summary", month, months], queryFn: () => api<Summary>(`/finance/summary?month=${month}&months=${months}`) });
}

export interface TxFilter {
  account?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
}

export function useTransactions(f: TxFilter) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") params.set(k, String(v));
  return useQuery({
    queryKey: [...KEY, "tx", params.toString()],
    queryFn: () => api<{ items: Transaction[]; total: number }>(`/finance/transactions?${params}`),
    placeholderData: (prev) => prev,
  });
}

/** A write against the Finance API that refreshes everything Finance shows. */
export function useFinanceMutation<A>(fn: (args: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) });
}

export const financeApi = {
  setup: (body: { seedCategories: boolean; account?: Omit<Account, "id" | "archived" | "sort"> }) =>
    api("/finance/setup", { method: "POST", json: body }),
  createAccount: (a: Omit<Account, "id" | "archived" | "sort">) => api<{ id: string }>("/finance/accounts", { method: "POST", json: a }),
  updateAccount: (id: string, patch: Partial<Account>) => api(`/finance/accounts/${id}`, { method: "PATCH", json: patch }),
  deleteAccount: (id: string) => api(`/finance/accounts/${id}`, { method: "DELETE" }),
  createCategory: (c: Pick<Category, "name" | "kind" | "group">) => api<{ id: string }>("/finance/categories", { method: "POST", json: c }),
  updateCategory: (id: string, patch: Partial<Category>) => api(`/finance/categories/${id}`, { method: "PATCH", json: patch }),
  deleteCategory: (id: string) => api(`/finance/categories/${id}`, { method: "DELETE" }),
  createTx: (t: { accountId: string; date: string; amount: number; payee: string; notes?: string; categoryId?: string | null }) =>
    api<{ id: string }>("/finance/transactions", { method: "POST", json: t }),
  createTransfer: (t: { fromAccountId: string; toAccountId: string; date: string; amount: number; toAmount?: number; payee?: string }) =>
    api("/finance/transactions", { method: "POST", json: { kind: "transfer", ...t } }),
  updateTx: (id: string, patch: Partial<Pick<Transaction, "accountId" | "date" | "amount" | "payee" | "notes" | "categoryId">>) =>
    api(`/finance/transactions/${id}`, { method: "PATCH", json: patch }),
  deleteTx: (id: string) => api(`/finance/transactions/${id}`, { method: "DELETE" }),
  setBudget: (categoryId: string, month: string, amount: number | null) => api("/finance/budgets", { method: "PUT", json: { categoryId, month, amount } }),
  createRule: (match: string, categoryId: string, applyToExisting: boolean) =>
    api<{ id: string; updated: number }>("/finance/rules", { method: "POST", json: { match, categoryId, applyToExisting } }),
  deleteRule: (id: string) => api(`/finance/rules/${id}`, { method: "DELETE" }),
  linkTransfers: (pairs: [string, string][]) => api<{ linked: number }>("/finance/transfers/link", { method: "POST", json: { pairs } }),
  ignoreTransfers: (pairs: [string, string][]) => api("/finance/transfers/ignore", { method: "POST", json: { pairs } }),
  unlinkTransfer: (id: string) => api("/finance/transfers/unlink", { method: "POST", json: { id } }),
  markTransfer: (id: string, accountId: string, otherAmount?: number) => api(`/finance/transactions/${id}/transfer`, { method: "POST", json: { accountId, otherAmount } }),
};

export function useTransferSuggestions() {
  return useQuery({ queryKey: [...KEY, "transfer-suggestions"], queryFn: () => api<TransferSuggestion[]>("/finance/transfers/suggestions") });
}

export interface FinancePrefs extends Record<string, unknown> {
  /** Currency used for totals, budgets and widgets. Accounts in other currencies are listed separately. */
  baseCurrency: string;
}

export function useFinancePrefs() {
  return useModulePrefs<FinancePrefs>("finance", { baseCurrency: "GBP" });
}

/** Effective budget for a category in a month: the month's override, else the "every month" amount. */
export function budgetFor(state: FinanceState, categoryId: string, month: string): number | null {
  const own = state.budgets.find((b) => b.categoryId === categoryId && b.month === month);
  if (own) return own.amount;
  return state.budgets.find((b) => b.categoryId === categoryId && b.month === "*")?.amount ?? null;
}

/** Today's rates from `base`, only fetched when some account uses another currency. */
export function useRates(state: FinanceState | undefined, base: string) {
  const needed = !!state?.accounts.some((a) => !a.archived && a.currency !== base);
  return useQuery({ queryKey: [...KEY, "rates", base], queryFn: () => api<Rates>(`/finance/rates?base=${base}`), enabled: needed, staleTime: 3600_000, retry: 1 });
}
