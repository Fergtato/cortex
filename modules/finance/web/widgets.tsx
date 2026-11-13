import { useMemo } from "react";
import { strConf, useRouter, type WidgetProps } from "@cortex/core";
import { Meter, Stat } from "@cortex/ui";
import "./finance.css";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../shared/money";
import { Amount, BarChart } from "./components";
import { useFinancePrefs, useFinanceState, useRates, useSummary, useTransactions } from "./data";
import { pctDelta, useMonthFigures } from "./views";

/*
 * Finance widgets for Home dashboards. They read through the same query hooks
 * as the Finance pages, so a change anywhere updates every widget.
 */

function useFigures() {
  const { prefs } = useFinancePrefs();
  const month = currentMonth();
  const state = useFinanceState();
  const summary = useSummary(month, 6);
  const rates = useRates(state.data, prefs.baseCurrency);
  const f = useMonthFigures(state.data, summary.data, prefs.baseCurrency, month, rates.data);
  return { f, state: state.data, summary: summary.data, base: prefs.baseCurrency, month };
}

function Unset({ text }: { text: string }) {
  return <div className="dw-unconfigured">{text}</div>;
}

export function BalanceWidget({ widget }: WidgetProps) {
  const { f, state, summary, base } = useFigures();
  const accountId = strConf(widget.config, "accountId");
  const label = strConf(widget.config, "label");
  if (!state || !summary || !f) return null;
  if (!state.accounts.length) return <Unset text="Set up Finance to see balances." />;
  const acct = accountId ? state.accounts.find((a) => a.id === accountId) : undefined;
  const value = acct ? (summary.balances.find((b) => b.accountId === acct.id)?.balance ?? acct.openingBalance) : f.netWorth;
  return (
    <div className="fin-w fin-w--center">
      <Stat label={label || (acct ? acct.name : "Net worth")} value={formatMoney(value, acct?.currency ?? base)} />
    </div>
  );
}

export function BalanceConfig({ widget, dash }: WidgetProps) {
  const state = useFinanceState();
  return (
    <div className="dw-config-form">
      <label className="dw-config-label">Show</label>
      <select className="dw-config-select" value={strConf(widget.config, "accountId")} onChange={(e) => dash.patchWidget(widget.id, { accountId: e.target.value })}>
        <option value="">Net worth (all accounts)</option>
        {state.data?.accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <label className="dw-config-label">Label (optional)</label>
      <input className="dw-config-input" value={strConf(widget.config, "label")} onChange={(e) => dash.patchWidget(widget.id, { label: e.target.value })} />
    </div>
  );
}

export function SpendingWidget() {
  const { f, base, month } = useFigures();
  if (!f) return null;
  const delta = pctDelta(f.spending, f.prevSpending);
  return (
    <div className="fin-w">
      <Stat label={`Spending · ${monthLabel(month)}`} value={formatMoney(f.spending, base)} delta={delta} good={delta ? delta.startsWith("-") : undefined} />
      {f.budgetTotal > 0 && (
        <Meter value={f.budgetSpent} max={f.budgetTotal} segments={24} tone={f.budgetSpent > f.budgetTotal ? "negative" : "accent"} valueLabel={`${formatMoney(Math.max(0, f.budgetTotal - f.budgetSpent), base)} left`} height={8} />
      )}
    </div>
  );
}

export function BudgetsWidget({ widget }: WidgetProps) {
  const { f, base } = useFigures();
  const limit = Number(widget.config.limit) || 5;
  if (!f) return null;
  if (!f.budgeted.length) return <Unset text="No budgets yet. Set them in Finance, Budgets." />;
  // Most-used first: the ones that need attention.
  const rows = f.budgeted
    .map(({ c, budget }) => ({ c, budget: budget!, spent: f.spendRows.find((r) => r.id === c.id)?.amount ?? 0 }))
    .sort((a, b) => b.spent / b.budget - a.spent / a.budget)
    .slice(0, limit);
  return (
    <div className="fin-w fin-w--list">
      <span className="cx-label">Budgets</span>
      {rows.map((r) => (
        <Meter key={r.c.id} value={r.spent} max={r.budget} segments={20} tone={r.spent > r.budget ? "negative" : "ink"} label={r.c.name} valueLabel={`${formatMoney(r.spent, base)} / ${formatMoney(r.budget, base)}`} height={6} />
      ))}
    </div>
  );
}

export function RecentWidget({ widget }: WidgetProps) {
  const { navigate } = useRouter();
  const limit = Number(widget.config.limit) || 6;
  const state = useFinanceState();
  const tx = useTransactions({ limit, account: strConf(widget.config, "accountId") || undefined });
  const accounts = useMemo(() => new Map(state.data?.accounts.map((a) => [a.id, a])), [state.data]);
  if (!tx.data || !state.data) return null;
  if (!tx.data.items.length) return <Unset text="No transactions yet." />;
  return (
    <div className="fin-w fin-w--list">
      <button type="button" className="cx-label fin-w__link" onClick={() => navigate("/finance/transactions")}>
        Recent transactions
      </button>
      <ul className="fin-w__tx">
        {tx.data.items.map((t) => (
          <li key={t.id}>
            <span className="fin-w__payee">{t.payee || "—"}</span>
            <Amount value={t.amount} currency={accounts.get(t.accountId)?.currency ?? "GBP"} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendWidget() {
  const { f, base, month } = useFigures();
  if (!f) return null;
  return (
    <div className="fin-w fin-w--chart">
      <span className="cx-label">Spending by month</span>
      <BarChart
        label="Spending by month"
        height={140}
        bars={f.trend.map((t) => ({ key: t.month, label: monthLabel(t.month).split(" ")[0], value: t.spending, highlight: t.month === month }))}
        format={(v) => formatMoney(v, base)}
        formatTick={(v) => formatMoney(v, base, { compact: true })}
      />
      <span className="fin-muted fin-small">Through {monthLabel(shiftMonth(month, 0), "long")}</span>
    </div>
  );
}
