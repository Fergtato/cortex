import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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

/* ------------------------------------------------------------- Bar chart */

export interface Bar {
  key: string;
  label: string;
  value: number;
  highlight?: boolean;
}

/** Round tick step for an axis reaching `max`. */
function niceStep(max: number, ticks = 4): number {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/**
 * Single-series column chart (dataviz spec): ink bars ≤24px with a 4px rounded
 * data end and a square baseline, the highlighted bar in the accent with its
 * value labelled, hairline gridlines, a per-bar hover/focus tooltip whose hit
 * area is the whole band. Values must be ≥ 0.
 */
export function BarChart({ bars, format, formatTick, height = 200, label }: { bars: Bar[]; format: (v: number) => string; formatTick: (v: number) => string; height?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const padL = 52;
  const padB = 24;
  const padT = 20;
  const plotW = Math.max(0, width - padL);
  const plotH = height - padB - padT;
  const max = Math.max(0, ...bars.map((b) => b.value));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const band = bars.length ? plotW / bars.length : 0;
  const barW = Math.min(24, Math.max(4, band * 0.5));
  const y = (v: number) => padT + plotH - (v / top) * plotH;

  const roundedTop = (x: number, yTop: number, w: number, h: number) => {
    const r = Math.min(4, h, w / 2);
    if (h <= 0) return "";
    return `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yTop + h} Z`;
  };

  return (
    <div className="fin-chart" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="fin-chart__grid" x1={padL} x2={width} y1={y(t)} y2={y(t)} />
              <text className="fin-chart__tick" x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = padL + band * i + band / 2;
            const h = Math.max(0, y(0) - y(b.value));
            return (
              <g key={b.key}>
                <path className={`fin-chart__bar${b.highlight ? " is-highlight" : ""}${hover === i ? " is-hover" : ""}`} d={roundedTop(cx - barW / 2, y(b.value), barW, h)} />
                {b.highlight && b.value > 0 && (
                  <text className="fin-chart__value" x={cx} y={y(b.value) - 6} textAnchor="middle">
                    {format(b.value)}
                  </text>
                )}
                <text className={`fin-chart__tick${b.highlight ? " is-strong" : ""}`} x={cx} y={height - 6} textAnchor="middle">
                  {b.label}
                </text>
                {/* hit area: the whole band, focusable for keyboard readers */}
                <rect
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${b.label}: ${format(b.value)}`}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}
      {hover !== null && bars[hover] && (
        <div className="fin-tooltip" style={{ left: Math.min(width - 120, Math.max(0, padL + band * hover + band / 2 - 60)), top: Math.max(0, y(bars[hover].value) - 52) }}>
          <strong>{format(bars[hover].value)}</strong>
          <span>{bars[hover].label}</span>
        </div>
      )}
    </div>
  );
}

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
