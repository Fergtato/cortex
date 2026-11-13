import { useState } from "react";
import { api, PageFrame, useDialog } from "@cortex/core";
import { Badge, Button, Grid, Input, Panel, Segmented, Stat } from "@cortex/ui";
import type { FinanceState, Iou, Transaction } from "../shared/types";
import { convertMinor, formatMoney, todayIso } from "../shared/money";
import { AccountSelect, Modal, MoneyInput } from "./components";
import { useFinanceMutation, useFinancePrefs, useRates, useTransactions } from "./data";
import { CURRENCIES } from "./forms";

/*
 * IOUs: money owed to you and money you owe. Outstanding ones count in net
 * worth. The loan leaving an account and the repayment arriving are linked
 * to the IOU, so neither shows up as spending or income.
 */

const iouApi = {
  create: (b: { person: string; direction: Iou["direction"]; amount: number; currency: string; date: string; note: string; accountId?: string }) => api("/finance/ious", { method: "POST", json: b }),
  update: (id: string, b: Partial<Iou>) => api(`/finance/ious/${id}`, { method: "PATCH", json: b }),
  settle: (id: string, b: { transactionId?: string; accountId?: string; date?: string }) => api(`/finance/ious/${id}/settle`, { method: "POST", json: b }),
  reopen: (id: string) => api(`/finance/ious/${id}/reopen`, { method: "POST", json: {} }),
  remove: (id: string) => api(`/finance/ious/${id}`, { method: "DELETE" }),
};

export function IousPage({ state }: { state: FinanceState }) {
  const dialog = useDialog();
  const { prefs } = useFinancePrefs();
  const base = prefs.baseCurrency;
  const rates = useRates(state, base);
  const [editing, setEditing] = useState<Iou | "new" | null>(null);
  const [settling, setSettling] = useState<Iou | null>(null);
  const [show, setShow] = useState<"open" | "settled">("open");
  const reopen = useFinanceMutation((id: string) => iouApi.reopen(id));
  const remove = useFinanceMutation((id: string) => iouApi.remove(id));

  const inBase = (i: Iou) => (i.currency === base ? i.amount : rates.data ? (convertMinor(i.amount, i.currency, base, rates.data.rates) ?? 0) : 0);
  const open = state.ious.filter((i) => !i.settledAt);
  const owedToMe = open.filter((i) => i.direction === "owed_to_me");
  const iOwe = open.filter((i) => i.direction === "i_owe");
  const total = (xs: Iou[]) => xs.reduce((s, i) => s + inBase(i), 0);
  const list = state.ious.filter((i) => (show === "open" ? !i.settledAt : !!i.settledAt));

  // One line per person: what's outstanding with them, net.
  const people = [...new Set(open.map((i) => i.person))]
    .map((p) => ({ person: p, net: open.filter((i) => i.person === p).reduce((s, i) => s + (i.direction === "owed_to_me" ? 1 : -1) * inBase(i), 0) }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  return (
    <PageFrame
      crumbs={["Finance", "IOUs"]}
      title="IOUs"
      subtitle="Money owed to you and money you owe. Outstanding IOUs count in your net worth; repayments aren't counted as income."
      actions={
        <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing("new")}>
          Add IOU
        </Button>
      }
    >
      <Grid>
        <Panel span={4} label="Owed to you" meta={`${owedToMe.length} open`}>
          <Stat value={formatMoney(total(owedToMe), base)} />
        </Panel>
        <Panel span={4} label="You owe" meta={`${iOwe.length} open`}>
          <Stat value={formatMoney(total(iOwe), base)} />
        </Panel>
        <Panel span={4} label="Net" meta={base}>
          <Stat value={formatMoney(total(owedToMe) - total(iOwe), base, { signDisplay: "exceptZero" })} />
        </Panel>

        {people.length > 0 && (
          <Panel span={4} label="By person">
            <ul className="fin-people">
              {people.map((p) => (
                <li key={p.person}>
                  <span>{p.person}</span>
                  <span className={p.net >= 0 ? "fin-amount fin-amount--in" : "fin-amount"}>{p.net >= 0 ? `owes you ${formatMoney(p.net, base)}` : `you owe ${formatMoney(-p.net, base)}`}</span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel
          span={people.length ? 8 : 12}
          label={show === "open" ? "Outstanding" : "Settled"}
          action={
            <Segmented
              size="sm"
              aria-label="Show"
              options={[
                { value: "open", label: `Open ${open.length}` },
                { value: "settled", label: `Settled ${state.ious.length - open.length}` },
              ]}
              value={show}
              onChange={(v) => setShow(v as typeof show)}
            />
          }
          flush
        >
          {!list.length ? (
            <p className="fin-empty">{show === "open" ? "Nothing outstanding. Add an IOU when you lend or borrow money." : "Nothing settled yet."}</p>
          ) : (
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Person</th>
                    <th>Direction</th>
                    <th className="fin-num">Amount</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.id}>
                      <td className="fin-date">{new Date(`${i.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                      <td className="fin-payee">
                        <span>{i.person}</span>
                        {i.note && <span className="fin-notes">{i.note}</span>}
                      </td>
                      <td>
                        <Badge tone={i.direction === "owed_to_me" ? "positive" : "neutral"}>{i.direction === "owed_to_me" ? "Owes you" : "You owe"}</Badge>
                        {i.settledAt && <span className="fin-muted fin-small"> settled {new Date(`${i.settledAt}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>}
                      </td>
                      <td className="fin-num">
                        <span className={`fin-amount${i.direction === "owed_to_me" ? " fin-amount--in" : ""}`}>{formatMoney(i.amount, i.currency)}</span>
                      </td>
                      <td className="fin-row-actions">
                        {!i.settledAt ? (
                          <Button size="sm" variant="secondary" onClick={() => setSettling(i)}>
                            Repaid
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => reopen.mutate(i.id)}>
                            Reopen
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" icon="more" aria-label="Edit" onClick={() => setEditing(i)} />
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="x"
                          aria-label="Delete"
                          onClick={async () => {
                            if (await dialog.confirm(`Delete the IOU with ${i.person}? Linked transactions stay.`, { confirmLabel: "Delete", danger: true })) remove.mutate(i.id);
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </Grid>
      {editing && <IouForm state={state} iou={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {settling && <SettleForm state={state} iou={settling} onClose={() => setSettling(null)} />}
    </PageFrame>
  );
}

function IouForm({ state, iou, onClose }: { state: FinanceState; iou?: Iou; onClose: () => void }) {
  const { prefs } = useFinancePrefs();
  const accounts = state.accounts.filter((a) => !a.archived);
  const people = [...new Set(state.ious.map((i) => i.person))];
  const [direction, setDirection] = useState<Iou["direction"]>(iou?.direction ?? "owed_to_me");
  const [person, setPerson] = useState(iou?.person ?? "");
  const [currency, setCurrency] = useState(iou?.currency ?? prefs.baseCurrency);
  const [amount, setAmount] = useState<number | null>(iou?.amount ?? null);
  const [date, setDate] = useState(iou?.date ?? todayIso());
  const [note, setNote] = useState(iou?.note ?? "");
  const [accountId, setAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fitting = accounts.filter((a) => a.currency === currency);
  const save = useFinanceMutation(async () => {
    if (!person.trim()) throw new Error("Who is it with?");
    if (!amount || amount <= 0) throw new Error("Enter an amount.");
    const body = { person: person.trim(), direction, amount, currency, date, note };
    return iou ? iouApi.update(iou.id, body) : iouApi.create({ ...body, accountId: accountId || undefined });
  });
  return (
    <Modal
      title={iou ? "Edit IOU" : "Add IOU"}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate(undefined, { onSuccess: onClose, onError: (e) => setError((e as Error).message) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="fin-form">
        <Segmented
          size="sm"
          aria-label="Direction"
          options={[
            { value: "owed_to_me", label: "They owe me" },
            { value: "i_owe", label: "I owe them" },
          ]}
          value={direction}
          onChange={(v) => setDirection(v as Iou["direction"])}
        />
        <Input label="Person" list="fin-iou-people" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Sam" autoFocus />
        <datalist id="fin-iou-people">
          {people.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="fin-form__row">
          <MoneyInput label="Amount" value={amount} currency={currency} onChange={setAmount} />
          <label className="cx-field">
            <span className="cx-label cx-field__label">Currency</span>
            <select className="fin-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([currency, ...state.accounts.map((a) => a.currency), ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Concert tickets" />
        {!iou && fitting.length > 0 && (
          <label className="cx-field">
            <span className="cx-label cx-field__label">{direction === "owed_to_me" ? "Paid out of" : "Received into"}</span>
            <AccountSelect accounts={fitting} value={accountId} onChange={setAccountId} allLabel="Not from an account (e.g. their share of a bill)" />
          </label>
        )}
        {error && <p className="settings-error">{error}</p>}
      </div>
    </Modal>
  );
}

function SettleForm({ state, iou, onClose }: { state: FinanceState; iou: Iou; onClose: () => void }) {
  const accounts = state.accounts.filter((a) => !a.archived && a.currency === iou.currency);
  const sign = iou.direction === "owed_to_me" ? 1 : -1;
  // Recent transactions of the right size and direction: the repayment may already be imported.
  const recent = useTransactions({ limit: 300, from: iou.date });
  const candidates = (recent.data?.items ?? []).filter((t: Transaction) => !t.transferId && !t.iouId && Math.sign(t.amount) === sign && Math.abs(t.amount) === iou.amount && accounts.some((a) => a.id === t.accountId));
  const [mode, setMode] = useState<"link" | "record" | "none">("record");
  const [txId, setTxId] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const settle = useFinanceMutation(() => iouApi.settle(iou.id, mode === "link" ? { transactionId: txId, date } : mode === "record" ? { accountId, date } : { date }));
  const names = new Map(state.accounts.map((a) => [a.id, a.name]));
  return (
    <Modal
      title={`${iou.direction === "owed_to_me" ? `${iou.person} repaid you` : `You repaid ${iou.person}`} ${formatMoney(iou.amount, iou.currency)}`}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={settle.isPending || (mode === "link" && !txId) || (mode === "record" && !accountId)} onClick={() => settle.mutate(undefined, { onSuccess: onClose })}>
            Mark repaid
          </Button>
        </>
      }
    >
      <div className="fin-form">
        <Segmented
          size="sm"
          aria-label="Repayment"
          options={[
            ...(candidates.length ? [{ value: "link", label: `Link a transaction · ${candidates.length}` }] : []),
            ...(accounts.length ? [{ value: "record", label: "Record it" }] : []),
            { value: "none", label: "Just mark repaid" },
          ]}
          value={mode}
          onChange={(v) => setMode(v as typeof mode)}
        />
        {mode === "link" && (
          <select className="fin-select" value={txId} onChange={(e) => setTxId(e.target.value)}>
            <option value="">Choose the repayment</option>
            {candidates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.date} · {t.payee || "—"} · {names.get(t.accountId)}
              </option>
            ))}
          </select>
        )}
        {mode === "record" && (
          <div className="fin-form__row">
            <label className="cx-field">
              <span className="cx-label cx-field__label">{sign > 0 ? "Into" : "From"}</span>
              <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
            </label>
            <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        <p className="fin-hint">{mode === "none" ? "Settles the IOU without touching any account." : "The repayment won't count as income or spending."}</p>
      </div>
    </Modal>
  );
}
