import { useMemo, useRef, useState } from "react";
import { PageFrame, useRouter } from "@cortex/core";
import { Badge, Button, Grid, Panel, Segmented, Toggle } from "@cortex/ui";
import type { FinanceState, ImportRow } from "../shared/types";
import { formatMoney, parseMoney } from "../shared/money";
import { AccountSelect } from "./components";
import { financeApi, useFinanceMutation } from "./data";
import { BASE } from "./views";

/* ------------------------------------------------------------ CSV parsing */

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF/LF, and `,` `;` or tab (auto-detected). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/* ------------------------------------------------------------------ dates */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const DATE_FORMATS = ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY", "DD-MM-YYYY", "DD.MM.YYYY", "YYYY/MM/DD", "DD MMM YYYY"] as const;
type DateFormat = (typeof DATE_FORMATS)[number];

const pad = (n: number) => String(n).padStart(2, "0");

/** Parses a date in the given format to ISO, or null. Two-digit years are 20xx. */
export function parseDate(raw: string, fmt: DateFormat): string | null {
  const s = raw.trim().split(/[ T]\d{1,2}:\d{2}/)[0].trim();
  let y: number, m: number, d: number;
  if (fmt === "DD MMM YYYY") {
    const r = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/.exec(s);
    if (!r) return null;
    d = +r[1];
    m = MONTHS.indexOf(r[2].toLowerCase()) + 1;
    y = +r[3];
  } else {
    const parts = s.split(/[-/.]/).map((p) => p.trim());
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const n = parts.map(Number);
    if (fmt === "YYYY-MM-DD" || fmt === "YYYY/MM/DD") [y, m, d] = n;
    else if (fmt === "MM/DD/YYYY") [m, d, y] = n;
    else [d, m, y] = n;
  }
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The first format that parses every sample. US-style first for USD, day-first otherwise. */
export function detectDateFormat(samples: string[], currency: string): DateFormat {
  const order: DateFormat[] = currency === "USD" ? ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY", "YYYY/MM/DD", "DD-MM-YYYY", "DD.MM.YYYY", "DD MMM YYYY"] : [...DATE_FORMATS];
  const vals = samples.filter((s) => s.trim()).slice(0, 30);
  return order.find((f) => vals.length > 0 && vals.every((v) => parseDate(v, f))) ?? "YYYY-MM-DD";
}

/** FNV-1a 64-bit (as two 32-bit halves): a stable, short row id. Not security-relevant. */
function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/* --------------------------------------------------------------- mapping */

interface Mapping {
  hasHeader: boolean;
  date: number;
  dateFormat: DateFormat;
  amountMode: "single" | "split";
  amount: number;
  moneyIn: number;
  moneyOut: number;
  invert: boolean;
  decimalComma: boolean;
  payee: number;
  /** Optional extra column appended to the payee (reference, memo). */
  payee2: number;
}

const find = (header: string[], words: string[]) => header.findIndex((h) => words.some((w) => h.toLowerCase().includes(w)));

function guessMapping(rows: string[][], currency: string): Mapping {
  const header = rows[0] ?? [];
  const hasHeader = header.some((h) => /[a-z]/i.test(h)) && !parseMoney(header[header.length - 1] ?? "", currency);
  const body = hasHeader ? rows.slice(1) : rows;
  const date = Math.max(0, find(header, ["date"]));
  const moneyIn = find(header, ["paid in", "money in", "credit", "deposit"]);
  const moneyOut = find(header, ["paid out", "money out", "debit", "withdrawal"]);
  const amount = find(header, ["amount", "value"]);
  const payee = find(header, ["payee", "description", "name", "merchant", "details", "narrative", "memo"]);
  return {
    hasHeader,
    date,
    dateFormat: detectDateFormat(body.map((r) => r[date] ?? ""), currency),
    amountMode: amount < 0 && moneyIn >= 0 && moneyOut >= 0 ? "split" : "single",
    amount: amount >= 0 ? amount : Math.max(0, header.length - 1),
    moneyIn: Math.max(0, moneyIn),
    moneyOut: Math.max(0, moneyOut),
    invert: false,
    decimalComma: false,
    payee: payee >= 0 ? payee : Math.min(1, header.length - 1),
    payee2: -1,
  };
}

interface Parsed {
  rows: ImportRow[];
  errors: { line: number; reason: string }[];
}

function applyMapping(rows: string[][], m: Mapping, currency: string): Parsed {
  const out: ImportRow[] = [];
  const errors: Parsed["errors"] = [];
  const seen = new Map<string, number>();
  const body = m.hasHeader ? rows.slice(1) : rows;
  body.forEach((r, i) => {
    const line = i + (m.hasHeader ? 2 : 1);
    const date = parseDate(r[m.date] ?? "", m.dateFormat);
    if (!date) return errors.push({ line, reason: `date "${r[m.date] ?? ""}"` });
    let amount: number | null;
    if (m.amountMode === "single") amount = parseMoney(r[m.amount] ?? "", currency, m.decimalComma);
    else {
      const inn = parseMoney(r[m.moneyIn] ?? "", currency, m.decimalComma) ?? 0;
      const outt = parseMoney(r[m.moneyOut] ?? "", currency, m.decimalComma) ?? 0;
      amount = (r[m.moneyIn] ?? "").trim() || (r[m.moneyOut] ?? "").trim() ? Math.abs(inn) - Math.abs(outt) : null;
    }
    if (amount === null) return errors.push({ line, reason: "amount" });
    if (m.invert) amount = -amount;
    const payee = [r[m.payee] ?? "", m.payee2 >= 0 ? r[m.payee2] ?? "" : ""].map((s) => s.trim()).filter(Boolean).join(" · ").slice(0, 300);
    // Identical rows in one file are legitimately separate (two coffees), so number them.
    const key = `${date}|${amount}|${payee.toLowerCase()}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.push({ date, amount, payee, externalId: `csv:${hash(`${key}#${n}`)}` });
  });
  return { rows: out, errors };
}

/* -------------------------------------------------------------------- UI */

function ColumnSelect({ header, value, onChange, optional }: { header: string[]; value: number; onChange: (i: number) => void; optional?: boolean }) {
  return (
    <select className="fin-select" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {optional && <option value={-1}>None</option>}
      {header.map((h, i) => (
        <option key={i} value={i}>
          {h || `Column ${i + 1}`}
        </option>
      ))}
    </select>
  );
}

export function ImportPage({ state }: { state: FinanceState }) {
  const { navigate } = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const accounts = state.accounts.filter((a) => !a.archived);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const currency = state.accounts.find((a) => a.id === accountId)?.currency ?? "GBP";
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [m, setM] = useState<Mapping | null>(null);
  const [result, setResult] = useState<{ inserted: number; skipped: number; categorised: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useFinanceMutation((rows: ImportRow[]) => financeApi.importRows(accountId, rows));

  const header = file ? (m?.hasHeader ? file.rows[0] : file.rows[0].map((_, i) => `Column ${i + 1}`)) : [];
  const parsed = useMemo(() => (file && m ? applyMapping(file.rows, m, currency) : null), [file, m, currency]);
  const set = (patch: Partial<Mapping>) => setM((cur) => (cur ? { ...cur, ...patch } : cur));

  const onFile = async (f: File) => {
    setError(null);
    setResult(null);
    const rows = parseCsv(await f.text());
    if (rows.length < 1 || rows[0].length < 2) {
      setError("That file doesn't look like a CSV with at least two columns.");
      return;
    }
    setFile({ name: f.name, rows });
    setM(guessMapping(rows, currency));
  };

  return (
    <PageFrame crumbs={["Finance", "Import CSV"]} title="Import a CSV" subtitle="Bring in a statement exported from your bank. Rows already imported are skipped, and your rules file them into categories.">
      <Grid>
        <Panel span={12} label="1 · Account and file">
          <div className="fin-filters">
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onFile(f);
              }}
            />
            <Button variant="secondary" icon="plus" onClick={() => fileRef.current?.click()} disabled={!accountId}>
              {file ? "Choose another file" : "Choose CSV file"}
            </Button>
            {file && (
              <span className="fin-muted">
                {file.name} · {file.rows.length - (m?.hasHeader ? 1 : 0)} rows
              </span>
            )}
          </div>
          {error && <p className="settings-error">{error}</p>}
        </Panel>

        {file && m && (
          <Panel span={5} label="2 · Columns">
            <div className="fin-form">
              <Toggle checked={m.hasHeader} onChange={(hasHeader) => set({ hasHeader })} label="First row is a header" />
              <div className="fin-form__row">
                <label className="cx-field">
                  <span className="cx-label cx-field__label">Date</span>
                  <ColumnSelect header={header} value={m.date} onChange={(date) => set({ date })} />
                </label>
                <label className="cx-field">
                  <span className="cx-label cx-field__label">Date format</span>
                  <select className="fin-select" value={m.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as DateFormat })}>
                    {DATE_FORMATS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                </label>
              </div>
              <Segmented
                size="sm"
                aria-label="Amount columns"
                options={[
                  { value: "single", label: "One amount column" },
                  { value: "split", label: "Money in / out columns" },
                ]}
                value={m.amountMode}
                onChange={(v) => set({ amountMode: v as Mapping["amountMode"] })}
              />
              {m.amountMode === "single" ? (
                <label className="cx-field">
                  <span className="cx-label cx-field__label">Amount</span>
                  <ColumnSelect header={header} value={m.amount} onChange={(amount) => set({ amount })} />
                </label>
              ) : (
                <div className="fin-form__row">
                  <label className="cx-field">
                    <span className="cx-label cx-field__label">Money in</span>
                    <ColumnSelect header={header} value={m.moneyIn} onChange={(moneyIn) => set({ moneyIn })} />
                  </label>
                  <label className="cx-field">
                    <span className="cx-label cx-field__label">Money out</span>
                    <ColumnSelect header={header} value={m.moneyOut} onChange={(moneyOut) => set({ moneyOut })} />
                  </label>
                </div>
              )}
              <div className="fin-form__row">
                <label className="cx-field">
                  <span className="cx-label cx-field__label">Payee</span>
                  <ColumnSelect header={header} value={m.payee} onChange={(payee) => set({ payee })} />
                </label>
                <label className="cx-field">
                  <span className="cx-label cx-field__label">Add to payee</span>
                  <ColumnSelect header={header} value={m.payee2} onChange={(payee2) => set({ payee2 })} optional />
                </label>
              </div>
              <Toggle checked={m.invert} onChange={(invert) => set({ invert })} label="Flip signs (for exports where spending is positive)" />
              <Toggle checked={m.decimalComma} onChange={(decimalComma) => set({ decimalComma })} label="Decimal comma (1.234,56)" />
            </div>
          </Panel>
        )}

        {parsed && (
          <Panel span={7} label="3 · Preview" meta={`${parsed.rows.length} ready${parsed.errors.length ? ` · ${parsed.errors.length} skipped` : ""}`} flush>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Payee</th>
                    <th className="fin-num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 12).map((r) => (
                    <tr key={r.externalId}>
                      <td className="fin-date">{r.date}</td>
                      <td className="fin-payee">{r.payee || "—"}</td>
                      <td className="fin-num">
                        <span className={`fin-amount${r.amount > 0 ? " fin-amount--in" : ""}`}>{formatMoney(r.amount, currency, { signDisplay: r.amount > 0 ? "always" : "auto" })}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parsed.errors.length > 0 && (
              <p className="settings-error fin-pad">
                Couldn't read {parsed.errors.length} rows ({parsed.errors.slice(0, 3).map((e) => `line ${e.line}: ${e.reason}`).join("; ")}
                {parsed.errors.length > 3 ? "…" : ""}). Check the date format and columns.
              </p>
            )}
            <div className="fin-import-actions">
              {result ? (
                <>
                  <Badge tone="positive">{result.inserted} imported</Badge>
                  {result.skipped > 0 && <Badge>{result.skipped} already there</Badge>}
                  {result.categorised > 0 && <Badge tone="info">{result.categorised} filed by rules</Badge>}
                  <Button size="sm" variant="secondary" onClick={() => navigate(`${BASE}/transactions`)}>
                    Review transactions
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  disabled={!parsed.rows.length || run.isPending}
                  onClick={() => run.mutate(parsed.rows, { onSuccess: (r) => setResult(r as typeof result), onError: (e) => setError((e as Error).message) })}
                >
                  Import {parsed.rows.length} transactions
                </Button>
              )}
            </div>
          </Panel>
        )}
      </Grid>
    </PageFrame>
  );
}
