import { useEffect, useMemo, useRef, useState } from "react";
import { api, PageFrame, useDialog, useRouter } from "@cortex/core";
import { Badge, Button, Checkbox, Grid, Panel, Segmented, Toggle } from "@cortex/ui";
import { useQuery } from "@tanstack/react-query";
import { ACCOUNT_TYPES, type Account, type AccountType, type FinanceState, type ImportResult } from "../shared/types";
import { formatMoney } from "../shared/money";
import { AccountSelect } from "./components";
import { applyMapping, DATE_FORMATS, distinct, guessMapping, parseCsv, parseDate, ROLE_HELP, ROLES, toImportRows, type DateFormat, type MappedRow, type Mapping, type Preset, type Role } from "./csv";
import { financeApi, useFinanceMutation } from "./data";
import { BASE } from "./views";

/*
 * CSV import in one screen: the file as it is (a column picker above each
 * column), the settings that apply, and the transactions it will become,
 * row by row, before anything is written.
 */

type View = "new" | "existing" | "skip";
const SAMPLE_ROWS = 6;
const PREVIEW_ROWS = 100;

export function ImportPage({ state }: { state: FinanceState }) {
  const { navigate } = useRouter();
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const accounts = state.accounts.filter((a) => !a.archived);
  const [file, setFile] = useState<{ name: string; rows: string[][] } | null>(null);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [m, setM] = useState<Mapping | null>(null);
  const [view, setView] = useState<View>("new");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<Mapping>) => {
    setResult(null);
    setM((cur) => (cur ? { ...cur, ...patch } : cur));
  };

  const onFile = async (f: File) => {
    setError(null);
    setResult(null);
    const rows = parseCsv(await f.text());
    if (rows.length < 2 || rows[0].length < 2) {
      setError("That file doesn't look like a CSV with a header and at least two columns.");
      return;
    }
    const g = guessMapping(rows, state.accounts, accounts[0]?.id ?? "");
    setFile({ name: f.name, rows });
    setPreset(g.preset);
    setM(g.mapping);
    setView("new");
  };

  const applied = useMemo(() => (file && m ? applyMapping(file.rows, m, state.accounts, preset?.currency) : null), [file, m, state.accounts, preset]);
  const importRows = useMemo(() => (applied ? toImportRows(applied.rows) : []), [applied]);

  // Which rows are already in Cortex (server dry run).
  const sig = useMemo(() => `${importRows.length}:${importRows.map((r) => `${r.accountId}|${r.externalId}`).join(",")}`, [importRows]);
  const existing = useQuery({
    queryKey: ["finance", "import-dry", sig],
    queryFn: () => api<{ existing: string[] }>("/finance/import", { method: "POST", json: { rows: importRows, dryRun: true } }),
    enabled: importRows.length > 0,
    staleTime: 0,
  });
  const existingSet = useMemo(() => new Set(existing.data?.existing ?? []), [existing.data]);

  const run = useFinanceMutation(() => api<ImportResult>("/finance/import", { method: "POST", json: { rows: importRows, balances: applied?.balances ?? [] } }));

  const stateOf = (r: MappedRow): View => (r.skip ? "skip" : existingSet.has(`${r.accountId}|${r.externalId}`) && !r.upsert ? "existing" : "new");
  const counts = { new: 0, existing: 0, skip: 0 } as Record<View, number>;
  for (const r of applied?.rows ?? []) counts[stateOf(r)]++;
  const visible = (applied?.rows ?? []).filter((r) => stateOf(r) === view);

  const header = file ? (m?.hasHeader ? file.rows[0] : file.rows[0].map((_, i) => `Column ${i + 1}`)) : [];
  const body = file && m ? (m.hasHeader ? file.rows.slice(1) : file.rows) : [];
  const col = (r: Role) => m?.roles.indexOf(r) ?? -1;
  const accountName = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? "—";
  const currencyOf = (id: string) => state.accounts.find((a) => a.id === id)?.currency ?? "GBP";

  const setRole = (i: number, role: Role) => {
    if (!m) return;
    // One column per role, except Date (two date columns are allowed) and Ignore.
    const roles = m.roles.map((r, j) => (j === i ? role : role !== "ignore" && role !== "date" && r === role ? "ignore" : r));
    const patch: Partial<Mapping> = { roles };
    if (role === "status") patch.statuses = distinct(body, i).filter((s) => !/revert|declin|fail|cancel|reject/i.test(s));
    if (role === "account") patch.accountMap = Object.fromEntries(distinct(body, i).map((v) => [v, m.accountMap[v] ?? ""]));
    set(patch);
  };

  const newAccount = async (forValue?: string) => {
    const name = await dialog.prompt("New account name", forValue ?? "");
    if (!name?.trim()) return null;
    const curCol = col("currency");
    const acctCol = col("account");
    const sampleCur = curCol >= 0 ? body.find((r) => acctCol < 0 || (r[acctCol] ?? "").trim() === forValue)?.[curCol]?.trim().toUpperCase() : undefined;
    const currency = preset?.currency ?? (sampleCur && /^[A-Z]{3}$/.test(sampleCur) ? sampleCur : currencyOf(m?.accountId ?? ""));
    const type: AccountType = /saving|pocket|fund/i.test(`${name} ${forValue ?? ""}`) ? "savings" : "current";
    const { id } = await financeApi.createAccount({ name: name.trim(), type: ACCOUNT_TYPES.includes(type) ? type : "current", currency, openingBalance: 0 });
    return id;
  };
  const createAccount = useFinanceMutation(async (forValue: string | null) => {
    const id = await newAccount(forValue ?? undefined);
    if (!id || !m) return;
    if (forValue === null) set({ accountId: id });
    else set({ accountMap: { ...m.accountMap, [forValue]: id } });
  });

  const sampleDate = (() => {
    const c = m?.roles.map((r, i) => (r === "date" ? i : -1)).filter((i) => i >= 0) ?? [];
    const raw = body.find((r) => c.some((i) => (r[i] ?? "").trim()))?.filter((_, i) => c.includes(i)).filter(Boolean).pop() ?? "";
    return raw ? { raw, parsed: parseDate(raw, m!.dateFormat) } : null;
  })();

  useEffect(() => {
    if (counts.new === 0 && counts.existing > 0 && view === "new") setView("existing");
  }, [counts.new, counts.existing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <PageFrame
      crumbs={["Finance", "Import CSV"]}
      title="Import a CSV"
      subtitle="Bring in a statement exported from your bank. Pick what each column is; the preview shows exactly what will be added. Rows already imported are skipped."
    >
      <Grid>
        <Panel span={12} label="1 · File" meta={preset ? <Badge tone="info">{preset.label}</Badge> : undefined}>
          <div className="fin-filters">
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
            <Button variant={file ? "secondary" : "primary"} icon="plus" onClick={() => fileRef.current?.click()} disabled={!accounts.length}>
              {file ? "Choose another file" : "Choose CSV file"}
            </Button>
            {file && (
              <span className="fin-muted">
                {file.name} · {body.length.toLocaleString()} rows
              </span>
            )}
            {!accounts.length && <span className="fin-muted">Add an account first.</span>}
          </div>
          {error && <p className="settings-error">{error}</p>}
        </Panel>

        {file && m && (
          <Panel span={12} label="2 · Your file" meta={`First ${Math.min(SAMPLE_ROWS, body.length)} of ${body.length.toLocaleString()} rows`} flush>
            <div className="fin-table-wrap">
              <table className="fin-table fin-rawtable">
                <thead>
                  <tr className="fin-rawtable__roles">
                    {header.map((_, i) => (
                      <th key={i} className={m.roles[i] === "ignore" ? "is-ignored" : "is-mapped"}>
                        <select className="fin-select fin-role" value={m.roles[i] ?? "ignore"} onChange={(e) => setRole(i, e.target.value as Role)} aria-label={`Column ${i + 1} is`} title={ROLE_HELP[m.roles[i] ?? "ignore"]}>
                          {(Object.keys(ROLES) as Role[]).map((r) => (
                            <option key={r} value={r}>
                              {ROLES[r]}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {header.map((h, i) => (
                      <th key={i} className={m.roles[i] === "ignore" ? "is-ignored" : undefined}>
                        {h || `Column ${i + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.slice(0, SAMPLE_ROWS).map((r, ri) => (
                    <tr key={ri}>
                      {header.map((_, i) => (
                        <td key={i} className={m.roles[i] === "ignore" ? "is-ignored" : undefined}>
                          {r[i] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {file && m && (
          <Panel span={5} label="3 · Settings">
            <div className="fin-form">
              <Toggle checked={m.hasHeader} onChange={(hasHeader) => set({ hasHeader })} label="First row is a header" />

              {col("account") >= 0 ? (
                <div className="fin-field">
                  <span className="cx-label">Accounts</span>
                  <p className="fin-hint">Rows go to an account by their “{header[col("account")]}” value.</p>
                  {Object.keys(m.accountMap).map((v) => (
                    <div key={v} className="fin-map-row">
                      <span className="fin-map-row__key">{v}</span>
                      <AccountMapSelect
                        accounts={accounts}
                        value={m.accountMap[v]}
                        onChange={(id) => (id === "__new" ? createAccount.mutate(v) : set({ accountMap: { ...m.accountMap, [v]: id } }))}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="fin-field">
                  <span className="cx-label">Account</span>
                  <div className="fin-map-row">
                    <AccountSelect accounts={accounts} value={m.accountId} onChange={(accountId) => set({ accountId })} />
                    <Button size="sm" variant="ghost" icon="plus" onClick={() => createAccount.mutate(null)}>
                      New
                    </Button>
                  </div>
                </div>
              )}

              <div className="fin-field">
                <span className="cx-label">Date format</span>
                <div className="fin-map-row">
                  <select className="fin-select" value={m.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as DateFormat })}>
                    {DATE_FORMATS.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  {sampleDate && (
                    <span className={sampleDate.parsed ? "fin-muted" : "settings-error"}>
                      “{sampleDate.raw}” → {sampleDate.parsed ? new Date(`${sampleDate.parsed}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "can't read"}
                    </span>
                  )}
                </div>
              </div>

              {col("status") >= 0 && (
                <div className="fin-field">
                  <span className="cx-label">Import rows with status</span>
                  <div className="fin-checks">
                    {distinct(body, col("status")).map((s) => (
                      <Checkbox className="cx-check--select" key={s} label={s} checked={m.statuses.includes(s)} onChange={(on) => set({ statuses: on ? [...m.statuses, s] : m.statuses.filter((x) => x !== s) })} />
                    ))}
                  </div>
                </div>
              )}

              {col("balance") >= 0 && (
                <Toggle checked={m.useBalance} onChange={(useBalance) => set({ useBalance })} label="Set account balances from the Balance column" />
              )}
              {m.combine && (
                <Toggle checked={m.combineOn} onChange={(combineOn) => set({ combineOn })} label="Combine daily interest, tax and fee rows into one per month" />
              )}
              <Toggle checked={m.invert} onChange={(invert) => set({ invert })} label="Flip signs (spending is positive in this file)" />
              <Toggle checked={m.decimalComma} onChange={(decimalComma) => set({ decimalComma })} label="Decimal comma (1.234,56)" />
            </div>
          </Panel>
        )}

        {applied && m && (
          <Panel span={7} label="4 · What will be imported" flush>
            <div className="fin-preview-bar">
              <Segmented
                size="sm"
                aria-label="Rows"
                options={[
                  { value: "new", label: `New ${counts.new.toLocaleString()}` },
                  { value: "existing", label: `Already in Cortex ${counts.existing.toLocaleString()}` },
                  { value: "skip", label: `Skipped ${counts.skip.toLocaleString()}` },
                ]}
                value={view}
                onChange={(v) => setView(v as View)}
              />
            </div>
            <div className="fin-table-wrap">
              <table className="fin-table">
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Date</th>
                    <th>Payee</th>
                    <th>Account</th>
                    <th className="fin-num">{view === "skip" ? "Why" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, PREVIEW_ROWS).map((r) => (
                    <tr key={`${r.line}-${r.externalId}`}>
                      <td className="fin-muted">{r.line}</td>
                      <td className="fin-date">{r.date || "—"}</td>
                      <td className="fin-payee">
                        <span>{r.payee || (r.skip ? (r.raw.find((x) => /[a-z]/i.test(x)) ?? "—") : "—")}</span>
                        {r.combined && r.combined > 1 && <span className="fin-notes">{r.combined} rows combined</span>}
                      </td>
                      <td className="fin-muted fin-acct">{r.accountId ? accountName(r.accountId) : "—"}</td>
                      <td className="fin-num">
                        {view === "skip" ? (
                          <span className="fin-muted">{r.skip}</span>
                        ) : (
                          <span className={`fin-amount${r.amount > 0 ? " fin-amount--in" : ""}`}>{formatMoney(r.amount, currencyOf(r.accountId), { signDisplay: r.amount > 0 ? "always" : "auto" })}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!visible.length && (
                    <tr>
                      <td colSpan={5} className="fin-muted">
                        {view === "new" ? "Nothing new to import." : view === "existing" ? "None of these rows are in Cortex yet." : "No rows skipped."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {visible.length > PREVIEW_ROWS && <p className="fin-hint fin-pad">Showing the first {PREVIEW_ROWS} of {visible.length.toLocaleString()}.</p>}
            </div>
            {applied.balances.length > 0 && !result && (
              <ul className="fin-balance-notes">
                {applied.balances.map((b) => (
                  <li key={b.accountId}>
                    {accountName(b.accountId)} balance will match the bank: <strong>{formatMoney(b.balance, currencyOf(b.accountId))}</strong>
                    {b.afterIds.length > 0 && <span className="fin-muted"> before {b.afterIds.length} pending</span>}
                  </li>
                ))}
              </ul>
            )}
            <div className="fin-import-actions">
              {result ? (
                <>
                  <Badge tone="positive">{result.inserted} imported</Badge>
                  {result.updated > 0 && <Badge>{result.updated} updated</Badge>}
                  {result.skipped > 0 && <Badge>{result.skipped} already there</Badge>}
                  {result.categorised > 0 && <Badge tone="info">{result.categorised} filed by rules</Badge>}
                  {result.balanceChanges.length > 0 && <Badge tone="info">{result.balanceChanges.length === 1 ? "Balance synced" : `${result.balanceChanges.length} balances synced`}</Badge>}
                  {result.transfers > 0 && (
                    <Button size="sm" variant="primary" onClick={() => navigate(`${BASE}/transactions?review=transfers`)}>
                      Review {result.transfers} possible transfers
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => navigate(`${BASE}/transactions`)}>
                    Open transactions
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  disabled={(!counts.new && !applied.balances.length) || run.isPending}
                  onClick={() => run.mutate(undefined, { onSuccess: (r) => setResult(r as ImportResult), onError: (e) => setError((e as Error).message) })}
                >
                  {run.isPending ? "Importing…" : counts.new ? `Import ${counts.new.toLocaleString()} transactions` : "Sync balances"}
                </Button>
              )}
            </div>
          </Panel>
        )}
      </Grid>
    </PageFrame>
  );
}

function AccountMapSelect({ accounts, value, onChange }: { accounts: Account[]; value: string; onChange: (id: string) => void }) {
  return (
    <select className={`fin-select${value ? "" : " fin-select--none"}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Skip these rows</option>
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name} · {a.currency}
        </option>
      ))}
      <option value="__new">New account…</option>
    </select>
  );
}
