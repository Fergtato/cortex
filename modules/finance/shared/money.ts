/** Number of minor-unit digits for a currency (GBP 2, JPY 0, BHD 3). */
export function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/** Formats minor units as money: `formatMoney(-12345, "GBP")` → "-£123.45". */
export function formatMoney(minor: number, currency: string, opts: { signDisplay?: "auto" | "always" | "exceptZero"; compact?: boolean; whole?: boolean } = {}): string {
  const digits = currencyDigits(currency);
  const value = (minor || 0) / 10 ** digits; // never "-£0.00"
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      signDisplay: opts.signDisplay ?? "auto",
      ...(opts.compact ? { notation: "compact", maximumFractionDigits: 1 } : opts.whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}

/**
 * Parses user/CSV input into minor units: "1,234.56", "-12.5", "(12.50)",
 * "£12", "12,50" (decimal comma). Returns null when it isn't a number.
 */
export function parseMoney(input: string, currency: string, decimalComma = false): number | null {
  let s = String(input).trim();
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
  if (decimalComma) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const digits = currencyDigits(currency);
  const minor = Math.round(parseFloat(s) * 10 ** digits);
  return negative ? -minor : minor;
}

/** "2026-11" → "Nov 2026". */
export function monthLabel(month: string, style: "short" | "long" = "short"): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: style, year: "numeric" });
}

export function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return currentMonth(d);
}

export function todayIso(d = new Date()): string {
  return `${currentMonth(d)}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Converts minor units between currencies with base-relative rates (units per 1 base). Null when a rate is missing. */
export function convertMinor(minor: number, from: string, to: string, rates: Record<string, number>): number | null {
  if (from === to) return minor;
  const rf = rates[from];
  const rt = rates[to];
  if (!rf || !rt) return null;
  const major = minor / 10 ** currencyDigits(from);
  return Math.round((major / rf) * rt * 10 ** currencyDigits(to));
}
