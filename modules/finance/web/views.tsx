import { useMemo, useState } from "react";
import { PageFrame, useRouter, type ModuleViewProps } from "@cortex/core";
import { Badge, Button, Grid, Meter, Panel, Sidebar, Stat, Toggle } from "@cortex/ui";
import "./finance.css";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType, type FinanceState, type Summary } from "../shared/types";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../shared/money";
import { BarChart, CategoryBars, MoneyInput, TransactionTable } from "./components";
import { budgetFor, financeApi, useFinanceMutation, useFinancePrefs, useFinanceState, useSummary, useTransactions } from "./data";
import { CURRENCIES, TransactionForm } from "./forms";
import { AccountsPage, BudgetsPage, CategoriesPage, TransactionsPage } from "./pages";
import { ImportPage } from "./import";

export const BASE = "/finance";

const SECTIONS = [
  { id: "/", label: "Overview", icon: "grid" as const },
  { id: "/transactions", label: "Transactions", icon: "list" as const },
  { id: "/accounts", label: "Accounts", icon: "wallet" as const },
  { id: "/budgets", label: "Budgets", icon: "calendar" as const },
  { id: "/categories", label: "Categories & rules", icon: "sliders" as const },
  { id: "/import", label: "Import CSV", icon: "arrow-down" as const },
];

export function FinanceSidebar({ subpath }: ModuleViewProps) {
  const { navigate } = useRouter();
  const state = useFinanceState();
  const summary = useSummary(currentMonth(), 1);
  const { prefs } = useFinancePrefs();
  const balances = new Map(summary.data?.balances.map((b) => [b.accountId, b.balance]));
  const active = SECTIONS.find((s) => s.id !== "/" && subpath.startsWith(s.id))?.id ?? (subpath.startsWith("/accounts/") ? "/accounts" : "/");
  const accounts = (state.data?.accounts ?? []).filter((a) => !a.archived);
  return (
    <Sidebar
      title="Finance"
      sections={[
        { items: SECTIONS },
        ...(accounts.length
          ? [
              {
                label: "Accounts",
                items: accounts.map((a) => ({
                  id: `/accounts/${a.id}`,
                  label: a.name,
                  count: balances.has(a.id) ? formatMoney(balances.get(a.id)!, a.currency, { compact: Math.abs(balances.get(a.id)!) >= 10_000_000 }) : undefined,
                })),
              },
            ]
          : []),
      ]}
      active={subpath.startsWith("/accounts/") ? subpath : active}
      onSelect={(id) => navigate(id === "/" ? BASE : BASE + id)}
      footer={<span className="notes-side-count">Totals in {prefs.baseCurrency}</span>}
    />
  );
}

export function FinancePage({ subpath }: ModuleViewProps) {
  const state = useFinanceState();
  if (state.isError) return <PageFrame crumbs={["Finance"]} title="Couldn't load Finance" subtitle={String(state.error)} />;
  if (!state.data) return <PageFrame crumbs={["Finance"]} />;
  const s = state.data;
  if (!s.accounts.length && !s.categories.length) return <Setup />;
  if (subpath.startsWith("/transactions")) return <TransactionsPage state={s} />;
  if (subpath.startsWith("/accounts/")) return <AccountsPage state={s} accountId={subpath.split("/")[2]} />;
  if (subpath.startsWith("/accounts")) return <AccountsPage state={s} />;
  if (subpath.startsWith("/budgets")) return <BudgetsPage state={s} />;
  if (subpath.startsWith("/categories")) return <CategoriesPage state={s} />;
  if (subpath.startsWith("/import")) return <ImportPage state={s} />;
  return <Overview state={s} />;
}

/* ------------------------------------------------------------------ Setup */

function Setup() {
  const { setPrefs } = useFinancePrefs();
  const [currency, setCurrency] = useState("GBP");
  const [name, setName] = useState("Current account");
  const [type, setType] = useState<AccountType>("current");
  const [opening, setOpening] = useState<number | null>(0);
  const [seed, setSeed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setup = useFinanceMutation(() =>
    financeApi.setup({ seedCategories: seed, account: name.trim() ? { name: name.trim(), type, currency, openingBalance: opening ?? 0 } : undefined }),
  );
  return (
    <PageFrame crumbs={["Finance", "Set up"]} title="Set up Finance" subtitle="Track accounts, spending and budgets. Everything stays on this server.">
      <Grid>
        <Panel span={7} label="Your first account" bracket>
          <div className="fin-form">
            <label className="cx-field">
              <span className="cx-label cx-field__label">Main currency</span>
              <select className="fin-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <span className="cx-field__hint">Totals, budgets and widgets use this. Accounts can use other currencies.</span>
            </label>
            <div className="fin-form__row">
              <label className="cx-field">
                <span className="cx-label cx-field__label">Account name</span>
                <span className="cx-input">
                  <input value={name} onChange={(e) => setName(e.target.value)} />
                </span>
              </label>
              <label className="cx-field">
                <span className="cx-label cx-field__label">Type</span>
                <select className="fin-select" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
                  {ACCOUNT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MoneyInput label="Current balance" value={opening} currency={currency} onChange={setOpening} hint="What the account holds today. You can add older transactions later." />
            <Toggle checked={seed} onChange={setSeed} label="Add a starter set of categories (groceries, bills, salary…)" />
            {error && <p className="settings-error">{error}</p>}
            <div>
              <Button
                variant="primary"
                onClick={() => {
                  setPrefs({ baseCurrency: currency });
                  setup.mutate(undefined, { onError: (e) => setError((e as Error).message) });
                }}
                disabled={setup.isPending}
              >
                Start tracking
              </Button>
            </div>
          </div>
        </Panel>
        <Panel span={5} label="Coming from a bank export?">
          <p className="fin-help">After setup, use Import CSV to bring in statements from your bank. Re-importing the same file never creates duplicates, and rules file transactions into categories automatically.</p>
        </Panel>
      </Grid>
    </PageFrame>
  );
}

/* ------------------------------------------------------------- Month nav */

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month === currentMonth();
  return (
    <span className="fin-monthnav">
      <Button size="sm" variant="ghost" aria-label="Previous month" icon="chevron-right" className="fin-flip" onClick={() => onChange(shiftMonth(month, -1))} />
      <span className="fin-monthnav__label">{monthLabel(month, "long")}</span>
      <Button size="sm" variant="ghost" aria-label="Next month" icon="chevron-right" disabled={isCurrent} onClick={() => onChange(shiftMonth(month, 1))} />
    </span>
  );
}

/* ------------------------------------------------------- Overview helpers */

/** The numbers Overview and the Home widgets share, in the base currency. */
export function useMonthFigures(state: FinanceState | undefined, summary: Summary | undefined, base: string, month: string) {
  return useMemo(() => {
    if (!state || !summary) return null;
    const cats = new Map(state.categories.map((c) => [c.id, c]));
    const baseAccounts = state.accounts.filter((a) => a.currency === base);
    const balances = new Map(summary.balances.map((b) => [b.accountId, b.balance]));
    const netWorth = baseAccounts.reduce((s, a) => s + (balances.get(a.id) ?? 0), 0);
    const otherCurrencies = [...new Set(state.accounts.filter((a) => a.currency !== base).map((a) => a.currency))].map((cur) => ({
      currency: cur,
      total: state.accounts.filter((a) => a.currency === cur).reduce((s, a) => s + (balances.get(a.id) ?? 0), 0),
    }));
    const totals = summary.totals.find((t) => t.currency === base) ?? { income: 0, expense: 0 };
    const spending = -totals.expense;
    const trend = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => {
      const t = summary.trend.find((x) => x.currency === base && x.month === m);
      return { month: m, spending: t ? -t.expense : 0, income: t?.income ?? 0 };
    });
    const prevSpending = trend[4]?.spending ?? 0;
    const spendRows = summary.byCategory
      .filter((r) => r.currency === base && r.amount < 0)
      .map((r) => {
        const c = r.categoryId ? cats.get(r.categoryId) : undefined;
        return { id: r.categoryId ?? "none", name: c?.name ?? "Uncategorised", amount: -r.amount, budget: r.categoryId ? budgetFor(state, r.categoryId, month) : null };
      })
      .sort((a, b) => b.amount - a.amount);
    const budgeted = state.categories.filter((c) => c.kind === "expense").map((c) => ({ c, budget: budgetFor(state, c.id, month) })).filter((x) => x.budget !== null && x.budget > 0);
    const budgetTotal = budgeted.reduce((s, x) => s + x.budget!, 0);
    const budgetSpent = budgeted.reduce((s, x) => s + (spendRows.find((r) => r.id === x.c.id)?.amount ?? 0), 0);
    return { netWorth, otherCurrencies, income: totals.income, spending, prevSpending, trend, spendRows, budgeted, budgetTotal, budgetSpent };
  }, [state, summary, base, month]);
}

export function pctDelta(now: number, prev: number): string | undefined {
  if (!prev) return undefined;
  const p = Math.round(((now - prev) / prev) * 100);
  return `${p > 0 ? "+" : ""}${p}%`;
}

/* --------------------------------------------------------------- Overview */

function Overview({ state }: { state: FinanceState }) {
  const { navigate } = useRouter();
  const { prefs } = useFinancePrefs();
  const base = prefs.baseCurrency;
  const [month, setMonth] = useState(currentMonth());
  const summary = useSummary(month, 6);
  const recent = useTransactions({ limit: 8 });
  const [adding, setAdding] = useState(false);
  const f = useMonthFigures(state, summary.data, base, month);
  const money = (v: number) => formatMoney(v, base);
  const delta = f ? pctDelta(f.spending, f.prevSpending) : undefined;

  return (
    <PageFrame
      crumbs={["Finance", "Overview"]}
      actions={
        <>
          <MonthNav month={month} onChange={setMonth} />
          <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>
            Add transaction
          </Button>
        </>
      }
    >
      <Grid>
        <Panel span={4} label="Net worth" meta={base}>
          <Stat
            value={f ? money(f.netWorth) : "—"}
            footer={
              f && f.otherCurrencies.length ? (
                <>
                  {f.otherCurrencies.map((o) => (
                    <span key={o.currency}>{formatMoney(o.total, o.currency)}</span>
                  ))}
                </>
              ) : undefined
            }
          />
        </Panel>
        <Panel span={4} label="Money in" meta={monthLabel(month)}>
          <Stat value={f ? money(f.income) : "—"} />
        </Panel>
        <Panel span={4} label="Spending" meta={monthLabel(month)}>
          {/* Spending going up is bad: the delta is coloured as "good" only when it falls. */}
          <Stat value={f ? money(f.spending) : "—"} delta={delta} good={delta ? delta.startsWith("-") : undefined} footer={delta ? <span>vs {monthLabel(shiftMonth(month, -1))}</span> : undefined} />
        </Panel>

        <Panel span={8} label="Spending by month" meta="Last 6 months">
          {f && (
            <BarChart
              label="Spending by month"
              bars={f.trend.map((t) => ({ key: t.month, label: monthLabel(t.month).split(" ")[0], value: t.spending, highlight: t.month === month }))}
              format={money}
              formatTick={(v) => formatMoney(v, base, v >= 1_000_000 ? { compact: true } : { whole: true })}
            />
          )}
        </Panel>
        <Panel span={4} label="Budgets" meta={f?.budgetTotal ? `${money(Math.max(0, f.budgetTotal - f.budgetSpent))} left` : undefined}>
          {f && f.budgeted.length ? (
            <div className="fin-meters">
              <Meter
                value={f.budgetSpent}
                max={f.budgetTotal}
                segments={24}
                tone={f.budgetSpent > f.budgetTotal ? "negative" : "accent"}
                label="All budgets"
                valueLabel={`${money(f.budgetSpent)} of ${money(f.budgetTotal)}`}
              />
              {f.budgeted.slice(0, 4).map(({ c, budget }) => {
                const spent = f.spendRows.find((r) => r.id === c.id)?.amount ?? 0;
                return <Meter key={c.id} value={spent} max={budget!} segments={24} tone={spent > budget! ? "negative" : "ink"} label={c.name} valueLabel={`${money(spent)} / ${money(budget!)}`} height={8} />;
              })}
            </div>
          ) : (
            <div className="fin-empty-cta">
              <p className="fin-empty">No budgets yet.</p>
              <Button size="sm" variant="secondary" onClick={() => navigate(`${BASE}/budgets`)}>
                Set budgets
              </Button>
            </div>
          )}
        </Panel>

        <Panel span={6} label="Where it went" meta={monthLabel(month)} action={<Badge>{f?.spendRows.length ?? 0} categories</Badge>}>
          {f && <CategoryBars rows={f.spendRows.slice(0, 8)} currency={base} />}
        </Panel>
        <Panel
          span={6}
          label="Recent"
          flush
          action={
            <Button size="sm" variant="ghost" iconRight="arrow-up-right" onClick={() => navigate(`${BASE}/transactions`)}>
              All
            </Button>
          }
        >
          {recent.data && <TransactionTable items={recent.data.items} state={state} showAccount={false} emptyText="No transactions yet. Add one, or import a CSV." />}
        </Panel>
      </Grid>
      {adding && <TransactionForm state={state} onClose={() => setAdding(false)} />}
    </PageFrame>
  );
}
