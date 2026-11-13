/*
 * Finance types shared by the server and the web app. Money is always an
 * integer number of minor units (pence, cents) in the account's currency;
 * dates are ISO `YYYY-MM-DD` strings.
 */

export const ACCOUNT_TYPES = ["current", "savings", "credit", "cash", "investment", "loan"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  current: "Current",
  savings: "Savings",
  credit: "Credit card",
  cash: "Cash",
  investment: "Investment",
  loan: "Loan",
};

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** ISO 4217 code, e.g. "GBP". */
  currency: string;
  openingBalance: number;
  archived: boolean;
  sort: number;
}

export type CategoryKind = "expense" | "income";

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  /** Display group, e.g. "Home", "Food". */
  group: string;
  archived: boolean;
  sort: number;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  /** Signed: negative = money out. */
  amount: number;
  payee: string;
  notes: string;
  categoryId: string | null;
  /** Set on both halves of a transfer between two accounts. */
  transferId: string | null;
  /** The account on the other side of a transfer (filled by the transactions list). */
  transferAccountId: string | null;
  /** "manual", "csv", later connector ids. */
  source: string;
}

/** A monthly budget for one category. `month` is "YYYY-MM", or "*" for every month without an override. */
export interface Budget {
  categoryId: string;
  month: string;
  amount: number;
}

/** "Payee contains `match` → category", applied on import and on demand. */
export interface Rule {
  id: string;
  match: string;
  categoryId: string;
}

export interface FinanceState {
  accounts: Account[];
  categories: Category[];
  budgets: Budget[];
  rules: Rule[];
}

export interface AccountBalance {
  accountId: string;
  balance: number;
}

/** Totals for one currency. Transfers are excluded from income/expense. */
export interface CurrencyTotals {
  currency: string;
  income: number;
  expense: number;
}

export interface Summary {
  month: string;
  balances: AccountBalance[];
  totals: CurrencyTotals[];
  /** Spending/income per category for the month, per currency. */
  byCategory: { currency: string; categoryId: string | null; amount: number }[];
  /** Last N months of income/expense per currency, oldest first. */
  trend: { currency: string; month: string; income: number; expense: number }[];
}

export interface ImportRow {
  accountId: string;
  date: string;
  amount: number;
  payee: string;
  /** Stable id for de-duplication (hash of the row). */
  externalId: string;
  /** Grouped rows (monthly interest) are updated when re-imported instead of skipped. */
  upsert?: boolean;
}

export interface ImportBalance {
  accountId: string;
  /** The bank's balance after a row in the file. */
  balance: number;
  /** externalIds of the rows the file lists after that balance (pending payments, later rows). */
  afterIds: string[];
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  categorised: number;
  balanceChanges: { accountId: string; from: number; to: number }[];
  /** Possible transfers involving the imported accounts, for review. */
  transfers: number;
}

interface SuggestionSide {
  accountId: string;
  date: string;
  amount: number;
  payee: string;
}

/** Two transactions that look like one transfer between the person's accounts. */
export interface TransferSuggestion {
  outId: string;
  inId: string;
  /** Different currencies (an exchange). */
  exchange: boolean;
  out: SuggestionSide;
  in: SuggestionSide;
}

/** Units of each currency per one unit of `base` (ECB reference rates). */
export interface Rates {
  base: string;
  date: string;
  rates: Record<string, number>;
}
