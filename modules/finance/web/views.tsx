import { useMemo, useState } from "react";
import { PageFrame, useRouter, type ModuleViewProps } from "@cortex/core";
import { Badge, Button, Grid, Meter, Panel, Sidebar, Stat, Toggle } from "@cortex/ui";
import "./finance.css";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type AccountType, type FinanceState, type Rates, type Summary } from "../shared/types";
import { convertMinor, currentMonth, formatMoney, monthLabel, shiftMonth } from "../shared/money";
import { BarChart, CategoryBars, MoneyInput, TransactionTable } from "./components";
import { budgetFor, financeApi, useFinanceMutation, useFinancePrefs, useFinanceState, useRates, useSummary, useTransactions } from "./data";
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

/**
 * The numbers Overview and the Home widgets share, in the base currency.
 * With rates, every account and transaction is converted at today's rate;
 * without them (offline, or one currency) only base-currency money counts.
 */
export function useMonthFigures(state: FinanceState | undefined, summary: Summary | undefined, base: string, month: string, rates?: Rates) {
  return useMemo(() => {
    if (!state || !summary) return null;
    const cats = new Map(state.categories.map((c) => [c.id, c]));
    const conv = (minor: number, cur: string) => (cur === base ? minor : rates ? convertMinor(minor, cur, base, rates.rates) : null);
    const sum = <T,>(items: T[], val: (x: T) => number, cur: (x: T) => string) => items.reduce((s, x) => s + (conv(val(x), cur(x)) ?? 0), 0);
    const balances = new Map(summary.balances.map((b) => [b.accountId, b.balance]));
    const accounts = state.accounts.filter((a) => !a.archived || (balances.get(a.id) ?? 0) !== 0);
    const netWorth = sum(accounts, (a) => balances.get(a.id) ?? 0, (a) => a.currency);
    // What's held in each currency, and accounts we couldn't convert.
    const holdings = [...new Set(accounts.map((a) => a.currency))].map((cur) => ({ currency: cur, total: accounts.filter((a) => a.currency === cur).reduce((s, a) => s + (balances.get(a.id) ?? 0), 0) }));
    const unconverted = holdings.filter((h) => conv(h.total, h.currency) === null).map((h) => h.currency);
    const monthTotals = summary.totals;
    const income = sum(monthTotals, (t) => t.income, (t) => t.currency);
    const spending = -sum(monthTotals, (t) => t.expense, (t) => t.currency);
    const trend = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5)).map((m) => {
      const rows = summary.trend.filter((x) => x.month === m);
      return { month: m, spending: -sum(rows, (t) => t.expense, (t) => t.currency), income: sum(rows, (t) => t.income, (t) => t.currency) };
    });
    const prevSpending = trend[4]?.spending ?? 0;
    const byCat = new Map<string, number>();
    for (const r of summary.byCategory) {
      if (r.amount >= 0) continue;
      const v = conv(-r.amount, r.currency);
      if (v !== null) byCat.set(r.categoryId ?? "none", (byCat.get(r.categoryId ?? "none") ?? 0) + v);
    }
    const spendRows = [...byCat.entries()]
      .map(([id, amount]) => {
        const c = id !== "none" ? cats.get(id) : undefined;
        return { id, name: c?.name ?? "Uncategorised", amount, budget: c ? budgetFor(state, c.id, month) : null };
      })
      .sort((a, b) => b.amount - a.amount);
    const budgeted = state.categories.filter((c) => c.kind === "expense").map((c) => ({ c, budget: budgetFor(state, c.id, month) })).filter((x) => x.budget !== null && x.budget > 0);
    const budgetTotal = budgeted.reduce((s, x) => s + x.budget!, 0);
    const budgetSpent = budgeted.reduce((s, x) => s + (spendRows.find((r) => r.id === x.c.id)?.amount ?? 0), 0);
    // The same figures in each other currency the person holds.
    const alsoIn = (minor: number) =>
      holdings
        .map((h) => h.currency)
        .filter((cur) => cur !== base)
        .map((cur) => ({ currency: cur, value: rates ? convertMinor(minor, base, cur, rates.rates) : null }))
        .filter((x): x is { currency: string; value: number } => x.value !== null);
    return { netWorth, holdings, unconverted, income, spending, prevSpending, trend, spendRows, budgeted, budgetTotal, budgetSpent, alsoIn, converted: !!rates };
  }, [state, summary, base, month, rates]);
}

/** "≈ ¥6,120,000 · ≈ £5,100" under a figure. */
function AlsoIn({ values }: { values: { currency: string; value: number }[] }) {
  if (!values.length) return null;
  return (
    <>
      {values.map((v) => (
        <span key={v.currency}>≈ {formatMoney(v.value, v.currency)}</span>
      ))}
    </>
  );
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
  const rates = useRates(state, base);
  const f = useMonthFigures(state, summary.data, base, month, rates.data);
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
          <Stat value={f ? money(f.netWorth) : "—"} footer={f ? <AlsoIn values={f.alsoIn(f.netWorth)} /> : undefined} />
        </Panel>
        <Panel span={4} label="Money in" meta={monthLabel(month)}>
          <Stat value={f ? money(f.income) : "—"} footer={f ? <AlsoIn values={f.alsoIn(f.income)} /> : undefined} />
        </Panel>
        <Panel span={4} label="Spending" meta={monthLabel(month)}>
          {/* Spending going up is bad: the delta is coloured as "good" only when it falls. */}
          <Stat
            value={f ? money(f.spending) : "—"}
            delta={delta}
            good={delta ? delta.startsWith("-") : undefined}
            footer={
              f ? (
                <>
                  <AlsoIn values={f.alsoIn(f.spending)} />
                  {delta && <span>vs {monthLabel(shiftMonth(month, -1))}</span>}
                </>
              ) : undefined
            }
          />
        </Panel>
        {f && f.holdings.length > 1 && (
          <Panel span={12} label="By currency" meta={rates.data ? `Rates ${new Date(`${rates.data.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · ECB` : rates.isError ? "Rates unavailable" : "Loading rates"}>
            <ul className="fin-holdings">
              {f.holdings.map((h) => {
                const inBase = rates.data ? convertMinor(h.total, h.currency, base, rates.data.rates) : null;
                return (
                  <li key={h.currency}>
                    <span className="cx-label">{h.currency}</span>
                    <span className="fin-holdings__value">{formatMoney(h.total, h.currency)}</span>
                    {h.currency !== base && <span className="fin-muted">{inBase !== null ? `≈ ${money(inBase)}` : "not converted"}</span>}
                  </li>
                );
              })}
            </ul>
            {f.unconverted.length > 0 && <p className="fin-hint">Without exchange rates, totals above only include {base} accounts.</p>}
          </Panel>
        )}

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
