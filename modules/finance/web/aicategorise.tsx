import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AiUnavailable, useAiStatus } from "@cortex/core";
import { Button, Checkbox } from "@cortex/ui";
import type { FinanceState } from "../shared/types";
import { CategorySelect, Modal } from "./components";
import { financeApi, useTransactions, type CategorySuggestion } from "./data";

/*
 * AI category suggestions for uncategorised transactions, grouped by payee.
 * Nothing changes until the person applies a row; "Make a rule" files the
 * same payee automatically next time, without asking the AI again.
 */

/** Rule text for a payee: up to the first reference number, lower case ("TESCO STORES 3021" → "tesco stores"). */
export const ruleMatch = (payee: string) => payee.toLowerCase().split(/\d{3,}|\*/)[0].replace(/\s+/g, " ").trim() || payee.toLowerCase().trim();

interface Row extends CategorySuggestion {
  rule: boolean;
  state: "open" | "busy" | "done" | "skipped";
}

export function AiCategoriseReview({ state, ids, onClose }: { state: FinanceState; ids?: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const status = useAiStatus();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [more, setMore] = useState(0);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);
  const started = useRef(false);

  const run = () => {
    setError("");
    setRows(null);
    financeApi
      .aiCategorise(ids)
      .then((r) => {
        setRows(r.suggestions.map((s) => ({ ...s, rule: true, state: "open" })));
        setMore(r.more);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "The AI couldn't suggest categories."));
  };
  useEffect(() => {
    if (status.data?.available && !started.current) {
      started.current = true;
      run();
    }
  }, [status.data?.available]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const apply = async (i: number) => {
    const r = rows?.[i];
    if (!r?.categoryId) return;
    patch(i, { state: "busy" });
    try {
      if (r.rule && ruleMatch(r.payee).length >= 2) await financeApi.createRule(ruleMatch(r.payee), r.categoryId, false);
      await financeApi.categorise(r.ids, r.categoryId);
      patch(i, { state: "done" });
    } catch (e) {
      patch(i, { state: "open" });
      setError(e instanceof Error ? e.message : "Couldn't apply that.");
    }
  };
  const applyAll = async () => {
    if (!rows) return;
    setApplying(true);
    for (let i = 0; i < rows.length; i++) if (rows[i].state === "open" && rows[i].categoryId) await apply(i);
    setApplying(false);
    void qc.invalidateQueries({ queryKey: ["finance"] });
  };
  const close = () => {
    void qc.invalidateQueries({ queryKey: ["finance"] });
    onClose();
  };

  const open = rows?.filter((r) => r.state === "open" && r.categoryId) ?? [];
  const done = rows?.filter((r) => r.state === "done").length ?? 0;

  return (
    <Modal
      title="Suggest categories with AI"
      onClose={close}
      wide
      actions={
        <>
          <Button variant="ghost" onClick={close}>
            {done ? "Done" : "Close"}
          </Button>
          <Button variant="primary" disabled={!open.length || applying} onClick={applyAll}>
            {applying ? "Applying…" : `Apply ${open.length}`}
          </Button>
        </>
      }
    >
      {status.isSuccess && !status.data.available ? (
        <AiUnavailable />
      ) : error ? (
        <div className="fin-ai-error">
          <p className="fin-error" role="alert">
            {error}
          </p>
          <Button size="sm" variant="secondary" onClick={run}>
            Try again
          </Button>
        </div>
      ) : !rows ? (
        <p className="fin-hint">Asking {status.data?.connection?.name ?? "your AI"} about your uncategorised payees…</p>
      ) : !rows.length ? (
        <p className="fin-hint">Nothing to categorise: every transaction has a category, or is a transfer or IOU.</p>
      ) : (
        <>
          <p className="fin-hint">
            Only payee names, money in or out, and your category list were sent to {status.data?.connection?.name ?? "your AI"}. Change any suggestion before applying. A rule files the same payee automatically in future imports.
            {more > 0 && ` ${more} more payees will be suggested next time.`}
          </p>
          <ul className="fin-aicat">
            {rows.map((r, i) => (
              <li key={`${r.direction}${r.payee}`} className={`fin-aicat__row is-${r.state}`}>
                <span className="fin-aicat__payee">
                  <span className="fin-aicat__name">{r.payee}</span>
                  <span className="fin-muted fin-small">
                    {r.ids.length} {r.ids.length === 1 ? "transaction" : "transactions"} · {r.direction === "in" ? "money in" : "money out"}
                  </span>
                </span>
                {r.state === "done" ? (
                  <span className="fin-aicat__done">Filed as {state.categories.find((c) => c.id === r.categoryId)?.name}</span>
                ) : r.state === "skipped" ? (
                  <span className="fin-muted fin-small">Skipped</span>
                ) : (
                  <>
                    <CategorySelect categories={state.categories} value={r.categoryId} onChange={(id) => patch(i, { categoryId: id })} kind={r.direction === "in" ? "income" : "expense"} noneLabel="No suggestion" />
                    <Checkbox className="cx-check--select" checked={r.rule} onChange={(v) => patch(i, { rule: v })} label="Make a rule" />
                    <span className="fin-aicat__btns">
                      <Button size="sm" variant="secondary" disabled={!r.categoryId || r.state === "busy"} onClick={() => apply(i)}>
                        Apply
                      </Button>
                      <Button size="sm" variant="ghost" disabled={r.state === "busy"} onClick={() => patch(i, { state: "skipped" })}>
                        Skip
                      </Button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/** Banner on Transactions when AI is connected and some transactions have no category. */
export function AiCategoriseBanner({ onReview }: { onReview: () => void }) {
  const status = useAiStatus();
  const none = useTransactions({ category: "none", limit: 1 });
  const n = none.data?.total ?? 0;
  if (!status.data?.available || !n) return null;
  return (
    <div className="fin-banner" role="status">
      <span>
        <strong>{n.toLocaleString()}</strong> {n === 1 ? "transaction has" : "transactions have"} no category. {status.data.connection?.name ?? "Your AI"} can suggest some from the payees.
      </span>
      <Button size="sm" variant="secondary" icon="sparkle" onClick={onReview}>
        Suggest categories
      </Button>
    </div>
  );
}
