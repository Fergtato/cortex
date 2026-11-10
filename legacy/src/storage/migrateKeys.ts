/**
 * One-time, idempotent migration of localStorage keys from the old
 * `project-tracker:*` namespace to the new `cortex:*` namespace.
 *
 * Runs once before React mounts (see main.tsx) so every reader of these keys
 * — useSettings, getDataSource/getAdapter, the sidebar initializer in App.tsx
 * — sees the migrated values on first read. After a successful migration the
 * old keys are deleted, leaving no remainder of the previous app name.
 *
 * Safe to run repeatedly: if a new key already exists, the old key is simply
 * dropped (the new value wins); if neither exists, nothing happens.
 */
const PAIRS: Array<[string, string]> = [
  ["project-tracker:pages:v1", "cortex:pages:v1"],
  ["project-tracker:databases:v1", "cortex:databases:v1"],
  ["project-tracker:settings:v1", "cortex:settings:v1"],
  ["project-tracker:datasource:v1", "cortex:datasource:v1"],
  ["project-tracker:sidebar", "cortex:sidebar"],
];

export function migrateStorageKeys(): void {
  if (typeof window === "undefined") return;
  for (const [oldKey, newKey] of PAIRS) {
    const oldValue = window.localStorage.getItem(oldKey);
    const newValue = window.localStorage.getItem(newKey);
    if (oldValue !== null && newValue === null) {
      window.localStorage.setItem(newKey, oldValue);
    }
    if (oldValue !== null) {
      window.localStorage.removeItem(oldKey);
    }
  }
}
