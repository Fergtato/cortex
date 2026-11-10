import { useEffect, useState, type ReactNode } from "react";
import { useDialog } from "@cortex/core";
import { Button, Icon } from "@cortex/ui";
import type { Account, Category, FinanceState, Transaction } from "../shared/types";
import { currencyDigits, formatMoney, parseMoney } from "../shared/money";
import { financeApi, useFinanceMutation } from "./data";

/* ------------------------------------------------------------------ Modal */

/** Overlay with a title and actions, on the design system's dialog styles. */
export function Modal({ title, onClose, children, actions, wide }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="cx-dialog-scrim" onMouseDown={onClose}>
      <div className={`cx-dialog fin-modal${wide ? " fin-modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <div className="fin-modal__head">
          <p className="cx-dialog__message">{title}</p>
          <Button size="sm" variant="ghost" icon="x" aria-label="Close" onClick={onClose} />
        </div>
        <div className="fin-modal__body">{children}</div>
        {actions && <div className="cx-dialog__actions">{actions}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Money input */

/** A text field that reads money ("1,234.56", "-12", "(5.00)") and reports minor units. */
export function MoneyInput({
  label,
  value,
  currency,
  onChange,
  hint,
  autoFocus,
}: {
  label: string;
  value: number | null;
  currency: string;
  onChange: (minor: number | null) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  const digits = currencyDigits(currency);
  const fmt = (v: number | null) => (v === null ? "" : (v / 10 ** digits).toFixed(digits));
  const [text, setText] = useState(() => fmt(value));
  const [invalid, setInvalid] = useState(false);
  return (
    <label className={`cx-field${invalid ? " cx-field--invalid" : ""}`}>
      <span className="cx-label cx-field__label">{label}</span>
      <span className="cx-input">
        <span className="fin-currency">{currency}</span>
        <input
          inputMode="decimal"
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.trim() ? parseMoney(e.target.value, currency) : null;
            setInvalid(e.target.value.trim() !== "" && v === null);
            onChange(v);
          }}
        />
      </span>
      {(hint || invalid) && <span className="cx-field__hint">{invalid ? "Enter an amount like 12.50" : hint}</span>}
    </label>
  );
}

/* ----------------------------------------------------------------- Amount */

/** A signed amount in the design system's figure style: money in is positive (green, "+"), money out is ink. */
export function Amount({ value, currency, strong }: { value: number; currency: string; strong?: boolean }) {
  return (
    <span className={`fin-amount${value > 0 ? " fin-amount--in" : ""}${strong ? " fin-amount--strong" : ""}`}>
      {formatMoney(value, currency, { signDisplay: value > 0 ? "always" : "auto" })}
    </span>
  );
}

/* -------------------------------------------------------- Category select */

export function CategorySelect({
  categories,
  value,
  onChange,
  kind,
  allowNone = true,
  noneLabel = "Uncategorised",
  className,
}: {
  categories: Category[];
  value: string | null;
  onChange: (id: string | null) => void;
  kind?: "expense" | "income";
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
}) {
  const visible = categories.filter((c) => !c.archived || c.id === value).filter((c) => !kind || c.kind === kind);
  const groups = [...new Set(visible.map((c) => c.group))];
  return (
    <select className={className ?? "fin-select"} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      {allowNone && <option value="">{noneLabel}</option>}
      {groups.map((g) => (
        <optgroup key={g} label={g}>
          {visible
            .filter((c) => c.group === g)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

export function AccountSelect({ accounts, value, onChange, allLabel, className }: { accounts: Account[]; value: string; onChange: (id: string) => void; allLabel?: string; className?: string }) {
  return (
    <select className={className ?? "fin-select"} value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel && <option value="">{allLabel}</option>}
      {accounts
        .filter((a) => !a.archived || a.id === value)
        .map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
    </select>
  );
}

/* ------------------------------------------------------------- Tx table */

/** Common payee core for a rule: drop store numbers, card refs and dates. */
export function ruleMatchFor(payee: string): string {
  return payee
    .replace(/\b\d[\d\s/.-]*\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

export function TransactionTable({
  items,
  state,
  onEdit,
  showAccount = true,
  emptyText,
}: {
  items: Transaction[];
  state: FinanceState;
  onEdit?: (t: Transaction) => void;
  showAccount?: boolean;
  emptyText?: string;
}) {
  const dialog = useDialog();
  const update = useFinanceMutation((a: { id: string; categoryId: string | null }) => financeApi.updateTx(a.id, { categoryId: a.categoryId }));
  const remove = useFinanceMutation((id: string) => financeApi.deleteTx(id));
  const addRule = useFinanceMutation((a: { match: string; categoryId: string }) => financeApi.createRule(a.match, a.categoryId, true));
  const [offerRule, setOfferRule] = useState<{ payee: string; categoryId: string } | null>(null);
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const cats = new Map(state.categories.map((c) => [c.id, c]));
  // The other half of each transfer, to show "→ Savings".
  const otherSide = (t: Transaction) => items.find((x) => x.transferId === t.transferId && x.id !== t.id);

  if (!items.length) return <p className="fin-empty">{emptyText ?? "No transactions."}</p>;

  return (
    <>
      {offerRule && (
        <div className="fin-banner" role="status">
          <span>
            Always file <strong>{ruleMatchFor(offerRule.payee)}</strong> under <strong>{cats.get(offerRule.categoryId)?.name}</strong>?
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const match = await dialog.prompt("Payee contains", ruleMatchFor(offerRule.payee));
              if (match && match.trim().length >= 2) addRule.mutate({ match: match.trim(), categoryId: offerRule.categoryId });
              setOfferRule(null);
            }}
          >
            Create rule
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOfferRule(null)}>
            Dismiss
          </Button>
        </div>
      )}
      <div className="fin-table-wrap">
        <table className="fin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee</th>
              <th>Category</th>
              {showAccount && <th>Account</th>}
              <th className="fin-num">Amount</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((t) => {
              const acct = accounts.get(t.accountId);
              const other = t.transferId ? otherSide(t) : undefined;
              return (
                <tr key={t.id}>
                  <td className="fin-date">{new Date(`${t.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</td>
                  <td className="fin-payee">
                    <span>{t.payee || "—"}</span>
                    {t.notes && <span className="fin-notes">{t.notes}</span>}
                  </td>
                  <td className="fin-cat">
                    {t.transferId ? (
                      <span className="fin-transfer">
                        Transfer {t.amount < 0 ? "to" : "from"} {other ? accounts.get(other.accountId)?.name : "another account"}
                      </span>
                    ) : (
                      <CategorySelect
                        className={`fin-select fin-select--inline${t.categoryId ? "" : " fin-select--none"}`}
                        categories={state.categories}
                        value={t.categoryId}
                        onChange={(categoryId) => {
                          update.mutate({ id: t.id, categoryId });
                          const hasRule = state.rules.some((r) => t.payee.toLowerCase().includes(r.match.toLowerCase()));
                          if (categoryId && !t.categoryId && !hasRule && ruleMatchFor(t.payee).length >= 2) setOfferRule({ payee: t.payee, categoryId });
                        }}
                      />
                    )}
                  </td>
                  {showAccount && <td className="fin-muted fin-acct">{acct?.name}</td>}
                  <td className="fin-num">
                    <Amount value={t.amount} currency={acct?.currency ?? "GBP"} />
                  </td>
                  <td className="fin-row-actions">
                    {onEdit && <Button size="sm" variant="ghost" aria-label="Edit" icon="more" onClick={() => onEdit(t)} />}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="x"
                      aria-label="Delete"
                      onClick={async () => {
                        const msg = t.transferId ? "Delete this transfer? Both sides are removed." : `Delete "${t.payee || "this transaction"}"?`;
                        if (await dialog.confirm(msg, { confirmLabel: "Delete", danger: true })) remove.mutate(t.id);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export { BarChart, type Bar } from "@cortex/ui";

/* --------------------------------------------------------- Category bars */

/** Ranked horizontal bars with the amount printed: a bar-table, so every value is readable without hover. */
export function CategoryBars({ rows, currency, max }: { rows: { id: string; name: string; amount: number; budget?: number | null }[]; currency: string; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => Math.max(r.amount, r.budget ?? 0)));
  if (!rows.length) return <p className="fin-empty">No spending this month.</p>;
  return (
    <ul className="fin-catbars">
      {rows.map((r) => {
        const over = r.budget != null && r.amount > r.budget;
        return (
          <li key={r.id}>
            <span className="fin-catbars__name">{r.name}</span>
            <span className="fin-catbars__track">
              <span className={`fin-catbars__fill${over ? " is-over" : ""}`} style={{ width: `${(r.amount / top) * 100}%` }} />
              {r.budget != null && r.budget > 0 && <span className="fin-catbars__budget" style={{ left: `${Math.min(100, (r.budget / top) * 100)}%` }} title="Budget" />}
            </span>
            <span className="fin-catbars__amount">
              {formatMoney(r.amount, currency)}
              {over && (
                <span className="fin-over">
                  <Icon name="arrow-up" size={12} /> over
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
