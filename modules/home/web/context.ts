import { createContext } from "react";
import type { DashStore } from "./store";

/** The dashboards store, provided app-wide by Home's Provider. */
export const DashContext = createContext<DashStore | null>(null);
