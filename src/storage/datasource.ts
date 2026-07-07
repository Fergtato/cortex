export type DataSourceMode = "local" | "api";

export interface DataSourceConfig {
  mode: DataSourceMode;
  /** Base URL of the API server when mode === "api" (no trailing slash). */
  apiUrl: string;
  /** Bearer token sent to the API (matches the server's CORTEX_TOKEN). */
  apiToken?: string;
}

export const DEFAULT_DATA_SOURCE: DataSourceConfig = {
  mode: "local",
  apiUrl: "http://localhost:3001",
  apiToken: "",
};

// The data-source choice itself always lives in localStorage so the app knows
// where to read everything else from, regardless of the chosen backend.
const KEY = "cortex:datasource:v1";

export function getDataSource(): DataSourceConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_DATA_SOURCE, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_DATA_SOURCE;
}

export function setDataSource(config: DataSourceConfig) {
  localStorage.setItem(KEY, JSON.stringify(config));
}
