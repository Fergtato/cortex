import type { Database, PropertyType } from "../../../types";
import type { Store } from "../../../store";

/**
 * Shared <select> rows for DB-connected widget config forms: pick a database,
 * one of its views, and (optionally type-filtered) one of its properties.
 */

export function DbSelect({
  store,
  value,
  onChange,
}: {
  store: Store;
  value: string;
  onChange: (dbId: string) => void;
}) {
  return (
    <select
      className="dw-config-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— choose database —</option>
      {store.databases.map((db) => (
        <option key={db.id} value={db.id}>
          {db.name || "untitled"}
        </option>
      ))}
    </select>
  );
}

export function ViewSelect({
  db,
  value,
  onChange,
  allowAll,
}: {
  db: Database | undefined;
  value: string;
  onChange: (viewId: string) => void;
  /** Offer an "all rows" option (empty value) ignoring every view filter. */
  allowAll?: boolean;
}) {
  return (
    <select
      className="dw-config-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!db}
    >
      {allowAll ? <option value="">all rows</option> : <option value="">— choose view —</option>}
      {db?.views.map((v) => (
        <option key={v.id} value={v.id}>
          {v.name} ({v.type})
        </option>
      ))}
    </select>
  );
}

export function PropSelect({
  db,
  value,
  onChange,
  types,
  emptyLabel,
}: {
  db: Database | undefined;
  value: string;
  onChange: (propId: string) => void;
  /** Restrict to these property types (absent = all). */
  types?: PropertyType[];
  emptyLabel: string;
}) {
  const props = db?.properties.filter((p) => !types || types.includes(p.type)) ?? [];
  return (
    <select
      className="dw-config-select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!db}
    >
      <option value="">{emptyLabel}</option>
      {props.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

/** String config value, defaulting to "". */
export function strConf(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === "string" ? v : "";
}
