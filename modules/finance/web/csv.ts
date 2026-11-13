import { currencyDigits } from "../shared/money";
import type { Account, ImportBalance, ImportRow } from "../shared/types";

/*
 * CSV import logic, kept apart from the UI: parse the file, recognise known
 * bank exports, guess what each column is, and turn rows into transactions
 * (plus the bank's running balance, when the file has one).
 */

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
export type DateFormat = (typeof DATE_FORMATS)[number];

const pad = (n: number) => String(n).padStart(2, "0");

/** Parses a date in the given format to ISO, or null. Ignores a trailing time ("…, 09:16:34"). Two-digit years are 20xx. */
export function parseDate(raw: string, fmt: DateFormat): string | null {
  const s = raw
    .trim()
    .split(/,?[ T]\d{1,2}:\d{2}/)[0]
    .trim()
    .replace(/,$/, "");
  let y: number, m: number, d: number;
  if (fmt === "DD MMM YYYY") {
    const r = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*\.?[\s-](\d{2,4})$/.exec(s);
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
  const vals = samples.filter((s) => s.trim()).slice(0, 40);
  return order.find((f) => vals.length > 0 && vals.every((v) => parseDate(v, f))) ?? "YYYY-MM-DD";
}

/* ---------------------------------------------------------------- numbers */

/** A decimal in major units, full precision: "1,234.5678", "(12.50)", "€12", "12,50" with decimalComma. */
export function parseDecimal(input: string, decimalComma = false): number | null {
  let s = String(input ?? "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,+-]/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  s = decimalComma ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const v = parseFloat(s);
  return negative ? -v : v;
}

export const toMinor = (major: number, currency: string) => Math.round(major * 10 ** currencyDigits(currency));

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

/* ---------------------------------------------------------------- mapping */

export const ROLES = {
  ignore: "Ignore",
  date: "Date",
  amount: "Amount",
  in: "Money in",
  out: "Money out",
  payee: "Payee",
  payee2: "Add to payee",
  fee: "Fee",
  balance: "Balance",
  currency: "Currency",
  account: "Account",
  status: "Status",
} as const;
export type Role = keyof typeof ROLES;

export const ROLE_HELP: Record<Role, string> = {
  ignore: "Not imported",
  date: "When it happened. With two date columns, the later filled one is used",
  amount: "Signed amount: negative is money out",
  in: "Money in, positive",
  out: "Money out, positive",
  payee: "Who or what",
  payee2: "Appended to the payee (reference, memo)",
  fee: "Subtracted from the amount",
  balance: "The bank's balance after the row; keeps the account balance in step",
  currency: "Rows in another currency than their account are skipped",
  account: "Splits rows across accounts (e.g. Revolut's Product: Current, Savings)",
  status: "Rows with failed or reverted statuses can be skipped",
};

export interface Mapping {
  hasHeader: boolean;
  roles: Role[];
  dateFormat: DateFormat;
  decimalComma: boolean;
  invert: boolean;
  /** Statuses to import (when a Status column is set). */
  statuses: string[];
  /** Account column value → account id ("" = skip). */
  accountMap: Record<string, string>;
  /** Used when there's no Account column. */
  accountId: string;
  /** Payees matching this are combined into one row per account and month ("" = off). */
  combine: string;
  combineLabel: string;
  combineOn: boolean;
  useBalance: boolean;
}

export interface Preset {
  id: string;
  label: string;
  /** Currency named by the file itself (Revolut's "Value, EUR"). */
  currency?: string;
  apply: (header: string[]) => Partial<Mapping>;
}

const norm = (h: string) => h.trim().toLowerCase();

/** Known exports, recognised by their header row. */
export function detectPreset(header: string[]): Preset | null {
  const h = header.map(norm);
  if (["type", "product", "started date", "completed date", "description", "amount", "fee", "currency", "state", "balance"].every((c) => h.includes(c))) {
    return {
      id: "revolut",
      label: "Revolut account statement",
      apply: (hdr) => ({
        roles: hdr.map((x): Role => {
          const n = norm(x);
          return n === "product" ? "account" : n.endsWith("date") ? "date" : n === "description" ? "payee" : n === "amount" ? "amount" : n === "fee" ? "fee" : n === "currency" ? "currency" : n === "state" ? "status" : n === "balance" ? "balance" : "ignore";
        }),
        dateFormat: "YYYY-MM-DD",
      }),
    };
  }
  const value = h.findIndex((x) => /^value, [a-z]{3}$/.test(x));
  if (h[0] === "date" && h[1] === "description" && value >= 0) {
    return {
      id: "revolut-savings",
      label: "Revolut savings fund",
      currency: header[value].trim().slice(-3).toUpperCase(),
      apply: (hdr) => ({
        roles: hdr.map((_, i): Role => (i === 0 ? "date" : i === 1 ? "payee" : i === value ? "amount" : "ignore")),
        dateFormat: "DD MMM YYYY",
        combine: "Return PAID|Withholding tax|Service Fee",
        combineLabel: "Interest, tax and fees",
        combineOn: true,
      }),
    };
  }
  return null;
}

const find = (header: string[], words: string[]) => header.findIndex((h) => words.some((w) => norm(h).includes(w)));

/** A first guess for any file: column names, then the shape of the values. */
export function guessMapping(rows: string[][], accounts: Account[], fallbackAccountId: string): { mapping: Mapping; preset: Preset | null } {
  const header = rows[0] ?? [];
  const preset = detectPreset(header);
  const hasHeader = header.some((h) => /[a-z]/i.test(h)) && parseDecimal(header[header.length - 1] ?? "") === null;
  const roles: Role[] = header.map(() => "ignore");
  const set = (i: number, r: Role) => i >= 0 && roles[i] === "ignore" && (roles[i] = r);
  if (hasHeader) {
    set(find(header, ["date"]), "date");
    const amount = find(header, ["amount", "value"]);
    const moneyIn = find(header, ["paid in", "money in", "credit", "deposit"]);
    const moneyOut = find(header, ["paid out", "money out", "debit", "withdrawal"]);
    if (amount < 0 && moneyIn >= 0 && moneyOut >= 0) {
      set(moneyIn, "in");
      set(moneyOut, "out");
    } else set(amount >= 0 ? amount : header.length - 1, "amount");
    set(find(header, ["payee", "description", "name", "merchant", "details", "narrative", "memo"]), "payee");
    set(find(header, ["balance"]), "balance");
    set(find(header, ["currency"]), "currency");
    set(find(header, ["fee"]), "fee");
    set(find(header, ["status", "state"]), "status");
  } else {
    roles[0] = "date";
    roles[1] = "payee";
    roles[roles.length - 1] = "amount";
  }
  const base: Mapping = {
    hasHeader,
    roles,
    dateFormat: "YYYY-MM-DD",
    decimalComma: false,
    invert: false,
    statuses: [],
    accountMap: {},
    accountId: fallbackAccountId,
    combine: "",
    combineLabel: "",
    combineOn: false,
    useBalance: true,
  };
  const mapping: Mapping = { ...base, ...(preset?.apply(header) ?? {}) };
  const body = mapping.hasHeader ? rows.slice(1) : rows;
  const currency = accounts.find((a) => a.id === fallbackAccountId)?.currency ?? "GBP";
  if (!preset) {
    const dateCol = mapping.roles.indexOf("date");
    mapping.dateFormat = detectDateFormat(body.map((r) => r[dateCol] ?? ""), currency);
  }
  // Statuses: everything except failures, by default.
  const statusCol = mapping.roles.indexOf("status");
  if (statusCol >= 0) mapping.statuses = distinct(body, statusCol).filter((s) => !/revert|declin|fail|cancel|reject/i.test(s));
  // Accounts: match each Account value to an account by name.
  const accountCol = mapping.roles.indexOf("account");
  if (accountCol >= 0) mapping.accountMap = guessAccounts(distinct(body, accountCol), accounts, body, accountCol, mapping.roles.indexOf("currency"));
  return { mapping, preset };
}

export function distinct(body: string[][], col: number): string[] {
  return [...new Set(body.map((r) => (r[col] ?? "").trim()).filter(Boolean))];
}

/** Account column values → accounts: by name first, then by type; never two values on one account. */
function guessAccounts(values: string[], accounts: Account[], body: string[][], accountCol: number, currencyCol: number): Record<string, string> {
  const map: Record<string, string> = {};
  const open = accounts.filter((a) => !a.archived);
  const used = new Set<string>();
  const currencyOf = (v: string) => (currencyCol >= 0 ? body.find((r) => (r[accountCol] ?? "").trim() === v)?.[currencyCol]?.trim() : undefined);
  const fits = (v: string) => open.filter((a) => !used.has(a.id) && (!currencyOf(v) || a.currency === currencyOf(v)));
  for (const v of values) {
    const hit = fits(v).find((a) => norm(a.name).includes(norm(v)) || norm(v).includes(norm(a.name)));
    if (hit) {
      map[v] = hit.id;
      used.add(hit.id);
    }
  }
  for (const v of values) {
    if (map[v]) continue;
    const wantSavings = /saving|pocket|vault/i.test(v);
    const options = fits(v);
    const hit = options.find((a) => (wantSavings ? a.type === "savings" && /pocket|vault/i.test(a.name) : false)) ?? options.find((a) => (wantSavings ? a.type === "savings" : a.type === "current")) ?? (values.length === 1 ? options[0] : undefined);
    map[v] = hit?.id ?? "";
    if (hit) used.add(hit.id);
  }
  return map;
}

/* --------------------------------------------------------------- applying */

export type RowState = "new" | "skip";

export interface MappedRow {
  line: number;
  raw: string[];
  accountId: string;
  date: string;
  amount: number;
  payee: string;
  balance: number | null;
  externalId: string;
  upsert?: boolean;
  /** Set when the row won't be imported. */
  skip?: string;
  /** Rows folded into this one (combined interest). */
  combined?: number;
}

export interface Applied {
  rows: MappedRow[];
  balances: ImportBalance[];
}

/** Turns the file into transactions under a mapping. Skipped rows are kept, with a reason, for the preview. */
export function applyMapping(rows: string[][], m: Mapping, accounts: Account[], fileCurrency?: string): Applied {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const body = m.hasHeader ? rows.slice(1) : rows;
  const col = (r: Role) => m.roles.indexOf(r);
  const dateCols = m.roles.map((r, i) => (r === "date" ? i : -1)).filter((i) => i >= 0);
  const [cAmount, cIn, cOut, cPayee, cPayee2, cFee, cBal, cCur, cAcct, cStatus] = (["amount", "in", "out", "payee", "payee2", "fee", "balance", "currency", "account", "status"] as Role[]).map(col);
  const combine = m.combine && m.combineOn ? new RegExp(m.combine, "i") : null;
  const seen = new Map<string, number>();
  const out: MappedRow[] = [];
  const groups = new Map<string, { row: MappedRow; major: number; currency: string }>();

  body.forEach((r, i) => {
    const line = i + (m.hasHeader ? 2 : 1);
    const v = (c: number) => (c >= 0 ? (r[c] ?? "").trim() : "");
    const base = { line, raw: r, accountId: "", date: "", amount: 0, payee: "", balance: null, externalId: `line:${line}` } as MappedRow;
    const skip = (reason: string) => out.push({ ...base, skip: reason });

    // Account
    let accountId = m.accountId;
    if (cAcct >= 0) {
      accountId = m.accountMap[v(cAcct)] ?? "";
      if (!accountId) return skip(`no account for “${v(cAcct)}”`);
    }
    const account = byId.get(accountId);
    if (!account) return skip("no account chosen");
    base.accountId = accountId;
    const currency = account.currency;
    if (cCur >= 0 && v(cCur) && v(cCur).toUpperCase() !== currency) return skip(`${v(cCur)} row, ${currency} account`);
    if (fileCurrency && fileCurrency !== currency) return skip(`${fileCurrency} file, ${currency} account`);
    if (cStatus >= 0 && !m.statuses.includes(v(cStatus))) return skip(`status ${v(cStatus) || "empty"}`);

    // Date: the last filled date column (Revolut: Completed, else Started).
    const rawDate = dateCols.map(v).filter(Boolean).pop() ?? "";
    const date = parseDate(rawDate, m.dateFormat);
    if (!date) return skip(`date “${rawDate}”`);

    // Amount, in full precision until the end.
    let major: number | null;
    if (cAmount >= 0) major = parseDecimal(v(cAmount), m.decimalComma);
    else if (cIn >= 0 || cOut >= 0) {
      const a = parseDecimal(v(cIn), m.decimalComma);
      const b = parseDecimal(v(cOut), m.decimalComma);
      major = a === null && b === null ? null : Math.abs(a ?? 0) - Math.abs(b ?? 0);
    } else major = null;
    if (major === null) return skip("no amount");
    if (cFee >= 0) major -= parseDecimal(v(cFee), m.decimalComma) ?? 0;
    if (m.invert) major = -major;

    const payee = [v(cPayee), v(cPayee2)].filter(Boolean).join(" · ").slice(0, 300);
    const balance = cBal >= 0 ? parseDecimal(v(cBal), m.decimalComma) : null;

    if (combine && combine.test(payee)) {
      const month = date.slice(0, 7);
      const key = `${accountId}|${month}`;
      const g = groups.get(key);
      if (g) {
        g.major += major;
        g.row.combined = (g.row.combined ?? 1) + 1;
        if (date > g.row.date) g.row.date = date;
      } else {
        const row: MappedRow = { ...base, date, amount: 0, payee: `${m.combineLabel || "Combined"} · ${monthName(month)}`, balance: null, externalId: `csv:grp:${hash(`${m.combine}|${month}`)}`, upsert: true, combined: 1 };
        groups.set(key, { row, major, currency });
        out.push(row);
      }
      return;
    }

    const amount = toMinor(major, currency);
    if (amount === 0) return skip("zero amount");
    // Identical rows in one file are legitimately separate (two coffees), so number them.
    const key = `${date}|${amount}|${payee.toLowerCase()}`;
    const n = (seen.get(`${accountId}|${key}`) ?? 0) + 1;
    seen.set(`${accountId}|${key}`, n);
    out.push({ ...base, date, amount, payee, balance: balance === null ? null : toMinor(balance, currency), externalId: `csv:${hash(`${key}#${n}`)}` });
  });

  for (const g of groups.values()) g.row.amount = toMinor(g.major, g.currency);
  for (const g of groups.values()) if (g.row.amount === 0) g.row.skip = "zero amount";

  return { rows: out, balances: m.useBalance && cBal >= 0 ? balanceAnchors(out) : [] };
}

const monthName = (month: string) => {
  const [y, mo] = month.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
};

/**
 * Per account: the newest row carrying a balance, and the rows after it
 * (pending payments). Files can run oldest-first or newest-first; the
 * direction comes from the first and last dates.
 */
function balanceAnchors(rows: MappedRow[]): ImportBalance[] {
  const ok = rows.filter((r) => !r.skip);
  if (!ok.length) return [];
  const descending = ok[0].date > ok[ok.length - 1].date;
  const chrono = descending ? [...ok].reverse() : ok;
  const out: ImportBalance[] = [];
  for (const accountId of new Set(chrono.map((r) => r.accountId))) {
    const mine = chrono.filter((r) => r.accountId === accountId);
    let anchor = -1;
    for (let i = mine.length - 1; i >= 0; i--) {
      if (mine[i].balance !== null) {
        anchor = i;
        break;
      }
    }
    if (anchor < 0) continue;
    out.push({ accountId, balance: mine[anchor].balance!, afterIds: mine.slice(anchor + 1).map((r) => r.externalId) });
  }
  return out;
}

export const toImportRows = (rows: MappedRow[]): ImportRow[] =>
  rows.filter((r) => !r.skip).map((r) => ({ accountId: r.accountId, date: r.date, amount: r.amount, payee: r.payee, externalId: r.externalId, ...(r.upsert ? { upsert: true } : {}) }));
