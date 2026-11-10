import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, PageFrame, type CortexModule, type ModuleBackup, type ModuleViewProps, type WidgetDef, type WidgetProps } from "@cortex/core";
import { useFinanceState } from "./data";

/*
 * Finance: accounts, transactions, budgets, categories and rules, CSV import.
 * Server half in ../server (typed tables, SQL summaries). Views and widgets
 * are lazy so Home stays light.
 */

const views = () => import("./views");
const LazySidebar = lazy(() => views().then((m) => ({ default: m.FinanceSidebar })));
const LazyPage = lazy(() => views().then((m) => ({ default: m.FinancePage })));

function withSuspense<P extends object>(C: ComponentType<P>, fallback: ReactNode = null) {
  return (props: P) => (
    <Suspense fallback={fallback}>
      <C {...props} />
    </Suspense>
  );
}

const widgetChunk = () => import("./widgets");
type W = typeof import("./widgets");
const L = (name: keyof W) => lazy(() => widgetChunk().then((m) => ({ default: m[name] as ComponentType<WidgetProps> })));

const widgets: WidgetDef[] = [
  { type: "finance.balance", label: "Balance", icon: "wallet", defaultSize: { w: 3, h: 2 }, defaultConfig: { accountId: "", label: "" }, Component: L("BalanceWidget"), ConfigForm: L("BalanceConfig") },
  { type: "finance.spending", label: "Spending this month", icon: "arrow-down", defaultSize: { w: 3, h: 2 }, defaultConfig: {}, Component: L("SpendingWidget") },
  { type: "finance.budgets", label: "Budgets", icon: "calendar", defaultSize: { w: 4, h: 3 }, defaultConfig: { limit: 5 }, Component: L("BudgetsWidget") },
  { type: "finance.recent", label: "Recent transactions", icon: "list", defaultSize: { w: 4, h: 3 }, defaultConfig: { limit: 6, accountId: "" }, Component: L("RecentWidget") },
  { type: "finance.trend", label: "Spending chart", icon: "arrow-up-right", defaultSize: { w: 6, h: 3 }, defaultConfig: {}, Component: L("TrendWidget") },
];

interface FinanceBackup {
  accounts?: unknown[];
  categories?: unknown[];
  transactions?: unknown[];
  budgets?: unknown[];
  rules?: unknown[];
}

const backup: ModuleBackup = {
  useBackup: () => {
    const state = useFinanceState();
    const qc = useQueryClient();
    return {
      ready: state.isSuccess,
      summary: state.data ? `${state.data.accounts.length} accounts · ${state.data.categories.length} categories` : "",
      exportData: () => api<FinanceBackup>("/finance/backup"),
      importData: async (data, mode) => {
        await api("/finance/backup", { method: "POST", json: { mode, data } });
        await qc.invalidateQueries({ queryKey: ["finance"] });
      },
    };
  },
  describe: (data) => {
    const d = data as FinanceBackup;
    return `${d?.accounts?.length ?? 0} accounts · ${d?.transactions?.length ?? 0} transactions`;
  },
};

export const financeModule: CortexModule = {
  id: "finance",
  name: "Finance",
  icon: "wallet",
  Sidebar: withSuspense<ModuleViewProps>(LazySidebar, <aside className="cx-side" />),
  Page: withSuspense<ModuleViewProps>(LazyPage, <PageFrame crumbs={["Finance"]} />),
  widgets,
  backup,
};
