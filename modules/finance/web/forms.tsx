import { useState } from "react";
import { useDialog } from "@cortex/core";
import { Button, Input, Segmented } from "@cortex/ui";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, type Account, type AccountType, type FinanceState, type Transaction } from "../shared/types";
import { todayIso } from "../shared/money";
import { AccountSelect, CategorySelect, Modal, MoneyInput } from "./components";
import { financeApi, useFinanceMutation } from "./data";

export const CURRENCIES = ["GBP", "EUR", "USD", "AUD", "CAD", "NZD", "CHF", "JPY", "SEK", "NOK", "DKK", "PLN", "ZAR", "INR", "SGD", "HKD"];

/* ------------------------------------------------------- Transaction form */

type Kind = "expense" | "income" | "transfer";

/** Add or edit a transaction. Amounts are typed positive; the kind sets the sign. */
export function TransactionForm({ state, tx, defaultAccountId, onClose }: { state: FinanceState; tx?: Transaction; defaultAccountId?: string; onClose: () => void }) {
  const accounts = state.accounts.filter((a) => !a.archived);
  const editingTransfer = !!tx?.transferId;
  const [kind, setKind] = useState<Kind>(tx ? (tx.transferId ? "transfer" : tx.amount > 0 ? "income" : "expense") : "expense");
  const [accountId, setAccountId] = useState(tx?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts.find((a) => a.id !== accountId)?.id ?? "");
  const [date, setDate] = useState(tx?.date ?? todayIso());
  const [amount, setAmount] = useState<number | null>(tx ? Math.abs(tx.amount) : null);
  const [payee, setPayee] = useState(tx?.payee ?? "");
  const [notes, setNotes] = useState(tx?.notes ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(tx?.categoryId ?? null);
  const [error, setError] = useState<string | null>(null);
  const currency = state.accounts.find((a) => a.id === accountId)?.currency ?? "GBP";
  const toCurrency = state.accounts.find((a) => a.id === toAccountId)?.currency ?? currency;
  const [toAmount, setToAmount] = useState<number | null>(null);

  const save = useFinanceMutation(async () => {
    if (!accountId) throw new Error("Add an account first.");
    if (amount === null || amount <= 0) throw new Error("Enter an amount.");
    if (kind === "transfer" && !tx) {
      if (!toAccountId || toAccountId === accountId) throw new Error("Pick two different accounts.");
      if (toCurrency !== currency && (toAmount === null || toAmount <= 0)) throw new Error("Enter the amount received.");
      return financeApi.createTransfer({ fromAccountId: accountId, toAccountId, date, amount, toAmount: toCurrency !== currency ? toAmount! : undefined, payee: payee || undefined });
    }
    const signed = editingTransfer ? (tx!.amount < 0 ? -amount : amount) : kind === "income" ? amount : -amount;
    const body = { accountId, date, amount: signed, payee: payee.trim(), notes, categoryId: editingTransfer ? undefined : categoryId };
    return tx ? financeApi.updateTx(tx.id, body) : financeApi.createTx(body);
  });

  const submit = () => {
    setError(null);
    save.mutate(undefined, { onSuccess: onClose, onError: (e) => setError((e as Error).message) });
  };

  return (
    <Modal
      title={tx ? (editingTransfer ? "Edit transfer" : "Edit transaction") : "Add transaction"}
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form
        className="fin-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {!tx && (
          <Segmented
            size="sm"
            aria-label="Type"
            options={[
              { value: "expense", label: "Money out" },
              { value: "income", label: "Money in" },
              ...(accounts.length > 1 ? [{ value: "transfer", label: "Transfer" }] : []),
            ]}
            value={kind}
            onChange={(v) => setKind(v as Kind)}
          />
        )}
        <div className="fin-form__row">
          <label className="cx-field">
            <span className="cx-label cx-field__label">{kind === "transfer" ? "From" : "Account"}</span>
            <AccountSelect accounts={state.accounts} value={accountId} onChange={setAccountId} />
          </label>
          {kind === "transfer" && !tx && (
            <label className="cx-field">
              <span className="cx-label cx-field__label">To</span>
              <AccountSelect accounts={state.accounts.filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} />
            </label>
          )}
        </div>
        <div className="fin-form__row">
          <MoneyInput label="Amount" value={amount} currency={currency} onChange={setAmount} autoFocus={!tx} />
          {kind === "transfer" && !tx && toCurrency !== currency && (
            <MoneyInput label="Amount received" value={toAmount} currency={toCurrency} onChange={setToAmount} />
          )}
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <Input label={kind === "transfer" ? "Description" : "Payee"} value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={kind === "transfer" ? "Transfer" : "Who was it?"} />
        {kind !== "transfer" && (
          <label className="cx-field">
            <span className="cx-label cx-field__label">Category</span>
            <CategorySelect categories={state.categories} value={categoryId} onChange={setCategoryId} kind={kind === "income" ? "income" : "expense"} noneLabel="Uncategorised (rules may fill it in)" />
          </label>
        )}
        {kind !== "transfer" && <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />}
        {error && <p className="settings-error">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------- Account form */

export function AccountForm({ account, baseCurrency, onClose }: { account?: Account; baseCurrency: string; onClose: () => void }) {
  const dialog = useDialog();
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "current");
  const [currency, setCurrency] = useState(account?.currency ?? baseCurrency);
  const [opening, setOpening] = useState<number | null>(account?.openingBalance ?? 0);
  const [error, setError] = useState<string | null>(null);

  const save = useFinanceMutation(async () => {
    if (!name.trim()) throw new Error("Give the account a name.");
    const body = { name: name.trim(), type, currency, openingBalance: opening ?? 0 };
    return account ? financeApi.updateAccount(account.id, body) : financeApi.createAccount(body);
  });
  const archive = useFinanceMutation(() => financeApi.updateAccount(account!.id, { archived: !account!.archived }));
  const remove = useFinanceMutation(() => financeApi.deleteAccount(account!.id));

  return (
    <Modal
      title={account ? "Edit account" : "Add account"}
      onClose={onClose}
      actions={
        <>
          {account && (
            <>
              <Button
                variant="danger"
                onClick={async () => {
                  if (await dialog.confirm(`Delete "${account.name}" and all its transactions? This can't be undone.`, { confirmLabel: "Delete", danger: true })) {
                    remove.mutate(undefined, { onSuccess: onClose });
                  }
                }}
              >
                Delete
              </Button>
              <Button variant="ghost" onClick={() => archive.mutate(undefined, { onSuccess: onClose })}>
                {account.archived ? "Unarchive" : "Archive"}
              </Button>
              <span className="fin-spacer" />
            </>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => save.mutate(undefined, { onSuccess: onClose, onError: (e) => setError((e as Error).message) })}>
            Save
          </Button>
        </>
      }
    >
      <div className="fin-form">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Everyday account" autoFocus />
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
        <div className="fin-form__row">
          <label className="cx-field">
            <span className="cx-label cx-field__label">Currency</span>
            <select className="fin-select" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([currency, ...CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <MoneyInput
            label="Opening balance"
            value={opening}
            currency={currency}
            onChange={setOpening}
            hint={type === "credit" || type === "loan" ? "Money owed is negative, e.g. -450.00" : "Balance before the first transaction you'll record"}
          />
        </div>
        {error && <p className="settings-error">{error}</p>}
      </div>
    </Modal>
  );
}
