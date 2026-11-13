import { useState } from "react";
import { Button, Icon } from "@cortex/ui";
import type { FinanceState, TransferSuggestion } from "../shared/types";
import { formatMoney } from "../shared/money";
import { Modal } from "./components";
import { financeApi, useFinanceMutation, useTransferSuggestions } from "./data";

/*
 * Transactions that look like money moving between the person's own
 * accounts. Linking them makes one transfer: both halves leave income and
 * spending, and net worth is unchanged by the move.
 */

export function TransferBanner({ onReview }: { onReview: () => void }) {
  const s = useTransferSuggestions();
  const n = s.data?.length ?? 0;
  if (!n) return null;
  return (
    <div className="fin-banner" role="status">
      <span>
        <strong>{n}</strong> {n === 1 ? "pair of transactions looks" : "pairs of transactions look"} like money moving between your accounts. Linked transfers don't count as income or spending.
      </span>
      <Button size="sm" variant="secondary" onClick={onReview}>
        Review
      </Button>
    </div>
  );
}

export function TransferReview({ state, onClose }: { state: FinanceState; onClose: () => void }) {
  const s = useTransferSuggestions();
  const [busy, setBusy] = useState<string | null>(null);
  const link = useFinanceMutation((pairs: [string, string][]) => financeApi.linkTransfers(pairs));
  const ignore = useFinanceMutation((pairs: [string, string][]) => financeApi.ignoreTransfers(pairs));
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const items = s.data ?? [];
  const pair = (p: TransferSuggestion): [string, string] => [p.outId, p.inId];

  const act = (p: TransferSuggestion, kind: "link" | "ignore") => {
    setBusy(p.outId);
    (kind === "link" ? link : ignore).mutate([pair(p)], { onSettled: () => setBusy(null) });
  };

  const side = (x: TransferSuggestion["out"]) => {
    const a = accounts.get(x.accountId);
    return (
      <span className="fin-xfer__side">
        <span className="fin-xfer__acct">{a?.name ?? "Account"}</span>
        <span className={`fin-amount${x.amount > 0 ? " fin-amount--in" : ""}`}>{formatMoney(x.amount, a?.currency ?? "GBP", { signDisplay: x.amount > 0 ? "always" : "auto" })}</span>
        <span className="fin-xfer__payee">{x.payee || "—"}</span>
      </span>
    );
  };

  return (
    <Modal
      title="Possible transfers"
      onClose={onClose}
      wide
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" disabled={!items.length || link.isPending} onClick={() => link.mutate(items.map(pair))}>
            {link.isPending ? "Linking…" : `Link all ${items.length}`}
          </Button>
        </>
      }
    >
      {s.isPending ? (
        <p className="fin-hint">Looking for transfers…</p>
      ) : !items.length ? (
        <p className="fin-hint">Nothing left to review. Transfers between your accounts are all linked.</p>
      ) : (
        <>
          <p className="fin-hint">Money leaving one account and arriving in another within a few days. Exchanges between currencies are matched by date and description.</p>
          <ul className="fin-xfers">
            {items.map((p) => (
              <li key={p.outId} className="fin-xfer">
                <span className="fin-xfer__date">
                  {new Date(`${p.out.date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                  {p.exchange && <span className="fin-xfer__tag">Exchange</span>}
                </span>
                {side(p.out)}
                <Icon name="arrow-up-right" size={14} className="fin-xfer__arrow" />
                {side(p.in)}
                <span className="fin-xfer__actions">
                  <Button size="sm" variant="secondary" disabled={busy === p.outId} onClick={() => act(p, "link")}>
                    Link
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === p.outId} onClick={() => act(p, "ignore")}>
                    Not a transfer
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
