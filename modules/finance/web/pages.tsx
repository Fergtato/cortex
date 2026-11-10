import { useState } from "react";
import { PageFrame, useDialog, useRouter } from "@cortex/core";
import { Badge, Button, Grid, Input, Meter, Panel, Segmented, Stat } from "@cortex/ui";
import { ACCOUNT_TYPE_LABELS, type Category, type FinanceState, type Transaction } from "../shared/types";
import { currentMonth, formatMoney, monthLabel, shiftMonth } from "../shared/money";
import { AccountSelect, Amount, CategorySelect, MoneyInput, TransactionTable } from "./components";
import { budgetFor, financeApi, useFinanceMutation, useFinancePrefs, useSummary, useTransactions } from "./data";
import { AccountForm, TransactionForm } from "./forms";
import { BASE, MonthNav } from "./views";

const monthRange = (m: string) => ({ from: `${m}-01`, to: `${m}-31` });

/* ----------------------------------------------------------- Transactions */

export function TransactionsPage({ state, accountId }: { state: FinanceState; accountId?: string }) {
  const [account, setAccount] = useState(accountId ?? "");
  const [category, setCategory] = useState("");
  const [month, setMonth] = useState<string>("");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const [editing, setEditing] = useState<Transaction | "new" | null>(null);
  const tx = useTransactions({ account: accountId ?? account, category, q, limit, ...(month ? monthRange(month) : {}) });
  const months = Array.from({ length: 24 }, (_, i) => shiftMonth(currentMonth(), -i));

  const body = (
    <>
      <div className="fin-filters">
        {!accountId && <AccountSelect accounts={state.accounts} value={account} onChange={setAccount} allLabel="All accounts" />}
        <select className="fin-select" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          <option value="none">Uncategorised</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="fin-select" value={month} onChange={(e) => setMonth(e.target.value)}>
          <option value="">Any date</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m, "long")}
            </option>
          ))}
        </select>
        <Input icon="search" placeholder="Search payee or notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <span className="fin-count">{tx.data ? `${tx.data.total.toLocaleString()} transactions` : ""}</span>
      </div>
      <Panel flush>
        {tx.data && <TransactionTable items={tx.data.items} state={state} onEdit={(t) => setEditing(t)} showAccount={!accountId} emptyText="Nothing matches these filters." />}
        {tx.data && tx.data.total > tx.data.items.length && (
          <div className="fin-more">
            <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 100)}>
              Show more
            </Button>
          </div>
        )}
      </Panel>
      {editing && <TransactionForm state={state} tx={editing === "new" ? undefined : editing} defaultAccountId={accountId} onClose={() => setEditing(null)} />}
    </>
  );

  if (accountId) return body;
  return (
    <PageFrame
      crumbs={["Finance", "Transactions"]}
      actions={
        <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing("new")}>
          Add transaction
        </Button>
      }
    >
      {body}
    </PageFrame>
  );
}

/* --------------------------------------------------------------- Accounts */

export function AccountsPage({ state, accountId }: { state: FinanceState; accountId?: string }) {
  const { navigate } = useRouter();
  const { prefs } = useFinancePrefs();
  const summary = useSummary(currentMonth(), 1);
  const [form, setForm] = useState<"new" | string | null>(null);
  const [adding, setAdding] = useState(false);
  const balances = new Map(summary.data?.balances.map((b) => [b.accountId, b.balance]));
  const account = accountId ? state.accounts.find((a) => a.id === accountId) : undefined;

  if (accountId) {
    if (!account) return <PageFrame crumbs={["Finance", "Accounts", "Not found"]} title="Account not found" />;
    const bal = balances.get(account.id) ?? account.openingBalance;
    return (
      <PageFrame
        crumbs={["Finance", "Accounts", account.name]}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => setForm(account.id)}>
              Edit account
            </Button>
            <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>
              Add transaction
            </Button>
          </>
        }
      >
        <Grid>
          <Panel span={4} label="Balance" meta={account.currency}>
            <Stat value={formatMoney(bal, account.currency)} footer={<span>{ACCOUNT_TYPE_LABELS[account.type]}</span>} />
          </Panel>
          <div className="fin-span-12">
            <TransactionsPage state={state} accountId={account.id} />
          </div>
        </Grid>
        {form && <AccountForm account={account} baseCurrency={prefs.baseCurrency} onClose={() => setForm(null)} />}
        {adding && <TransactionForm state={state} defaultAccountId={account.id} onClose={() => setAdding(false)} />}
      </PageFrame>
    );
  }

  const open = state.accounts.filter((a) => !a.archived);
  const archived = state.accounts.filter((a) => a.archived);
  return (
    <PageFrame
      crumbs={["Finance", "Accounts"]}
      title="Accounts"
      subtitle="Balances include every transaction recorded so far."
      actions={
        <Button size="sm" variant="primary" icon="plus" onClick={() => setForm("new")}>
          Add account
        </Button>
      }
    >
      <Grid>
        {open.map((a) => (
          <Panel key={a.id} span={4} label={ACCOUNT_TYPE_LABELS[a.type]} meta={a.currency} action={<Button size="sm" variant="ghost" onClick={() => setForm(a.id)}>Edit</Button>}>
            <button type="button" className="fin-account-card" onClick={() => navigate(`${BASE}/accounts/${a.id}`)}>
              <span className="fin-account-card__name">{a.name}</span>
              <Stat size="sm" value={formatMoney(balances.get(a.id) ?? a.openingBalance, a.currency)} />
            </button>
          </Panel>
        ))}
        {archived.length > 0 && (
          <Panel span={12} label="Archived" flush>
            <ul className="settings-list">
              {archived.map((a) => (
                <li key={a.id}>
                  <span className="settings-list__label">{a.name}</span>
                  <Amount value={balances.get(a.id) ?? a.openingBalance} currency={a.currency} />
                  <Button size="sm" variant="ghost" onClick={() => setForm(a.id)}>
                    Edit
                  </Button>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </Grid>
      {form && <AccountForm account={form === "new" ? undefined : state.accounts.find((a) => a.id === form)} baseCurrency={prefs.baseCurrency} onClose={() => setForm(null)} />}
    </PageFrame>
  );
}

/* ---------------------------------------------------------------- Budgets */

function BudgetCell({ category, state, currency }: { category: Category; state: FinanceState; currency: string }) {
  const every = state.budgets.find((b) => b.categoryId === category.id && b.month === "*")?.amount ?? null;
  const set = useFinanceMutation((a: { month: string; amount: number | null }) => financeApi.setBudget(category.id, a.month, a.amount));
  const [draft, setDraft] = useState<number | null>(every);
  const commit = () => {
    if (draft !== every) set.mutate({ month: "*", amount: draft && draft > 0 ? draft : null });
  };
  return (
    <div className="fin-budget-input" onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).blur()}>
      <MoneyInput label="Monthly" value={every} currency={currency} onChange={setDraft} />
    </div>
  );
}

export function BudgetsPage({ state }: { state: FinanceState }) {
  const { prefs } = useFinancePrefs();
  const base = prefs.baseCurrency;
  const [month, setMonth] = useState(currentMonth());
  const summary = useSummary(month, 1);
  const spentBy = new Map(summary.data?.byCategory.filter((r) => r.currency === base && r.categoryId).map((r) => [r.categoryId!, -r.amount]));
  const expense = state.categories.filter((c) => c.kind === "expense" && !c.archived);
  const groups = [...new Set(expense.map((c) => c.group))];
  const total = expense.reduce((s, c) => s + (budgetFor(state, c.id, month) ?? 0), 0);
  const spent = expense.reduce((s, c) => s + (budgetFor(state, c.id, month) ? Math.max(0, spentBy.get(c.id) ?? 0) : 0), 0);

  return (
    <PageFrame crumbs={["Finance", "Budgets"]} title="Budgets" subtitle={`Monthly limits per category, in ${base}. Leave a category empty to skip it.`} actions={<MonthNav month={month} onChange={setMonth} />}>
      <Grid>
        <Panel span={12} label={monthLabel(month, "long")} meta={total ? `${formatMoney(Math.max(0, total - spent), base)} left of ${formatMoney(total, base)}` : "No budgets set"}>
          <Meter value={spent} max={Math.max(1, total)} segments={48} tone={spent > total && total > 0 ? "negative" : "accent"} label="Spent in budgeted categories" valueLabel={formatMoney(spent, base)} />
        </Panel>
        {groups.map((g) => (
          <Panel key={g} span={6} label={g} flush>
            <ul className="fin-budget-list">
              {expense
                .filter((c) => c.group === g)
                .map((c) => {
                  const budget = budgetFor(state, c.id, month);
                  const s = Math.max(0, spentBy.get(c.id) ?? 0);
                  return (
                    <li key={c.id}>
                      <div className="fin-budget-row">
                        <span className="fin-budget-name">{c.name}</span>
                        <BudgetCell key={`${c.id}-${state.budgets.length}`} category={c} state={state} currency={base} />
                      </div>
                      {budget ? (
                        <Meter value={s} max={budget} segments={32} tone={s > budget ? "negative" : "ink"} valueLabel={`${formatMoney(s, base)} of ${formatMoney(budget, base)}${s > budget ? " · over" : ""}`} height={8} />
                      ) : (
                        <span className="fin-muted fin-small">{s ? `${formatMoney(s, base)} spent, no budget` : "No budget"}</span>
                      )}
                    </li>
                  );
                })}
            </ul>
          </Panel>
        ))}
      </Grid>
    </PageFrame>
  );
}

/* -------------------------------------------------- Categories and rules */

export function CategoriesPage({ state }: { state: FinanceState }) {
  const dialog = useDialog();
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const create = useFinanceMutation((c: Pick<Category, "name" | "kind" | "group">) => financeApi.createCategory(c));
  const update = useFinanceMutation((a: { id: string; patch: Partial<Category> }) => financeApi.updateCategory(a.id, a.patch));
  const remove = useFinanceMutation((id: string) => financeApi.deleteCategory(id));
  const addRule = useFinanceMutation((a: { match: string; categoryId: string }) => financeApi.createRule(a.match, a.categoryId, true));
  const delRule = useFinanceMutation((id: string) => financeApi.deleteRule(id));
  const [ruleMatch, setRuleMatch] = useState("");
  const [ruleCat, setRuleCat] = useState<string | null>(null);
  const [ruleMsg, setRuleMsg] = useState<string | null>(null);
  const list = state.categories.filter((c) => c.kind === kind);
  const groups = [...new Set(list.map((c) => c.group))];
  const cats = new Map(state.categories.map((c) => [c.id, c]));

  const add = async () => {
    const name = await dialog.prompt(`New ${kind === "income" ? "income" : "spending"} category`);
    if (!name?.trim()) return;
    const group = await dialog.choose("Group", [...groups.map((g) => ({ label: g, value: g })), { label: "New group…", value: "__new" }]);
    if (!group) return;
    const g = group === "__new" ? await dialog.prompt("Group name") : group;
    if (g?.trim()) create.mutate({ name: name.trim(), kind, group: g.trim() });
  };

  return (
    <PageFrame crumbs={["Finance", "Categories & rules"]} title="Categories & rules" subtitle="Rules file transactions automatically: when the payee contains the text, the category is set.">
      <Grid>
        <Panel
          span={7}
          label="Categories"
          action={
            <span className="fin-inline">
              <Segmented
                size="sm"
                aria-label="Kind"
                options={[
                  { value: "expense", label: "Spending" },
                  { value: "income", label: "Income" },
                ]}
                value={kind}
                onChange={(v) => setKind(v as "expense" | "income")}
              />
              <Button size="sm" variant="ghost" icon="plus" onClick={add}>
                Add
              </Button>
            </span>
          }
          flush
        >
          {groups.map((g) => (
            <div key={g} className="fin-cat-group">
              <div className="cx-label fin-cat-group__label">{g}</div>
              <ul className="settings-list">
                {list
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <li key={c.id}>
                      <span className={`settings-list__label${c.archived ? " fin-muted" : ""}`}>{c.name}</span>
                      {c.archived && <Badge>Archived</Badge>}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          const name = await dialog.prompt("Rename category", c.name);
                          if (name?.trim()) update.mutate({ id: c.id, patch: { name: name.trim() } });
                        }}
                      >
                        Rename
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: c.id, patch: { archived: !c.archived } })}>
                        {c.archived ? "Restore" : "Archive"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="x"
                        aria-label={`Delete ${c.name}`}
                        onClick={async () => {
                          if (await dialog.confirm(`Delete "${c.name}"? Its transactions become uncategorised; its budget and rules are removed.`, { confirmLabel: "Delete", danger: true })) remove.mutate(c.id);
                        }}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {!groups.length && <p className="fin-empty fin-pad">No categories yet.</p>}
        </Panel>

        <Panel span={5} label="Rules" meta={`${state.rules.length}`}>
          <form
            className="fin-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (ruleMatch.trim().length < 2 || !ruleCat) return;
              addRule.mutate(
                { match: ruleMatch.trim(), categoryId: ruleCat },
                {
                  onSuccess: (r) => {
                    const res = r as { updated: number };
                    setRuleMsg(res.updated ? `Rule added. ${res.updated} existing transactions filed.` : "Rule added.");
                    setRuleMatch("");
                  },
                },
              );
            }}
          >
            <Input label="Payee contains" placeholder="e.g. tesco" value={ruleMatch} onChange={(e) => setRuleMatch(e.target.value)} />
            <label className="cx-field">
              <span className="cx-label cx-field__label">Category</span>
              <CategorySelect categories={state.categories} value={ruleCat} onChange={setRuleCat} noneLabel="Choose category" />
            </label>
            <div>
              <Button type="submit" variant="secondary" disabled={ruleMatch.trim().length < 2 || !ruleCat}>
                Add rule
              </Button>
            </div>
            {ruleMsg && <p className="settings-ok">{ruleMsg}</p>}
          </form>
          <ul className="fin-rules">
            {state.rules.map((r) => (
              <li key={r.id}>
                <code>{r.match}</code>
                <span className="fin-muted">→</span>
                <span>{cats.get(r.categoryId)?.name ?? "?"}</span>
                <Button size="sm" variant="ghost" icon="x" aria-label={`Delete rule ${r.match}`} onClick={() => delRule.mutate(r.id)} />
              </li>
            ))}
          </ul>
        </Panel>
      </Grid>
    </PageFrame>
  );
}
