import type {
  CellValue,
  Database,
  DatabaseMap,
  DbItem,
  PropertyDef,
  SelectColor,
  SelectOption,
} from "../types";
import { isFolder, SELECT_COLORS } from "../types";

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Rotate through the palette so migrated options get distinct colours. */
export function colorForIndex(i: number): SelectColor {
  return SELECT_COLORS[i % SELECT_COLORS.length];
}

/**
 * Normalize a select property's options to `SelectOption[]`. Accepts the
 * legacy `string[]` shape (pre-v2), already-migrated objects, or a mix.
 * Returns the option list plus a legacy-name -> option-id map for remapping
 * cell values.
 */
export function normalizeOptions(raw: unknown): {
  options: SelectOption[];
  byName: Map<string, string>;
  changed: boolean;
} {
  const options: SelectOption[] = [];
  const byName = new Map<string, string>();
  let changed = false;
  if (Array.isArray(raw)) {
    for (const o of raw) {
      if (typeof o === "string") {
        // Legacy plain-string option.
        const opt: SelectOption = {
          id: uid(),
          name: o,
          color: colorForIndex(options.length),
        };
        options.push(opt);
        byName.set(o, opt.id);
        changed = true;
      } else if (o && typeof o === "object" && typeof (o as SelectOption).name === "string") {
        const src = o as Partial<SelectOption>;
        const valid =
          typeof src.id === "string" &&
          typeof src.color === "string" &&
          (SELECT_COLORS as readonly string[]).includes(src.color);
        const opt: SelectOption = valid
          ? (o as SelectOption)
          : {
              id: typeof src.id === "string" ? src.id : uid(),
              name: src.name!,
              color: (SELECT_COLORS as readonly string[]).includes(src.color as string)
                ? (src.color as SelectColor)
                : colorForIndex(options.length),
            };
        if (!valid) changed = true;
        options.push(opt);
        byName.set(opt.name, opt.id);
      }
    }
  }
  return { options, byName, changed };
}

/**
 * Migrate one database to the v2 model:
 *  - select options: `string[]` -> `SelectOption[]` (id + name + colour)
 *  - select cell values: option *name* -> option *id*
 *  - values referencing unknown names gain a new option (import safety)
 * Returns the same object (by reference) when nothing needed to change, so
 * the store's identity-based diffing doesn't re-persist untouched databases.
 */
export function migrateDatabase(db: Database): Database {
  let changed = false;
  const remapByProp = new Map<string, Map<string, string>>();
  const extraOptions = new Map<string, SelectOption[]>();

  const properties: PropertyDef[] = db.properties.map((p) => {
    if ((p.type !== "select" && p.type !== "multiselect") || !p.options) return p;
    const { options, byName, changed: optsChanged } = normalizeOptions(p.options);
    if (!optsChanged) {
      remapByProp.set(p.id, byName);
      return p;
    }
    changed = true;
    remapByProp.set(p.id, byName);
    extraOptions.set(p.id, options); // mutated below if unknown values appear
    return { ...p, options };
  });

  // Remap select cell values from legacy names to option ids.
  const knownIds = new Map<string, Set<string>>();
  for (const p of properties) {
    if (p.options) knownIds.set(p.id, new Set(p.options.map((o) => o.id)));
  }

  const mapValue = (propId: string, name: string): string => {
    const byName = remapByProp.get(propId);
    const existing = byName?.get(name);
    if (existing) return existing;
    // Value not present in options (e.g. imported data) — create an option.
    const list = extraOptions.get(propId);
    if (!list) return name; // property has object options but value is unknown name? keep as-is
    const opt: SelectOption = { id: uid(), name, color: colorForIndex(list.length) };
    list.push(opt);
    byName?.set(name, opt.id);
    knownIds.get(propId)?.add(opt.id);
    changed = true;
    return opt.id;
  };

  const rows = db.rows.map((row) => {
    let rowChanged = false;
    const cells: Record<string, CellValue> = { ...row.cells };
    for (const p of properties) {
      if (p.type !== "select" && p.type !== "multiselect") continue;
      const ids = knownIds.get(p.id);
      const v = cells[p.id];
      if (typeof v === "string" && v && ids && !ids.has(v)) {
        cells[p.id] = mapValue(p.id, v);
        rowChanged = true;
      } else if (Array.isArray(v) && ids) {
        const mapped = v.map((x) => (ids.has(x) ? x : mapValue(p.id, x)));
        if (mapped.some((x, i) => x !== v[i])) {
          cells[p.id] = mapped;
          rowChanged = true;
        }
      }
    }
    if (!rowChanged) return row;
    changed = true;
    return { ...row, cells };
  });

  if (!changed) return db;

  // extraOptions lists were mutated in place; rebuild properties with them.
  const finalProps = properties.map((p) => {
    const list = extraOptions.get(p.id);
    return list ? { ...p, options: list } : p;
  });

  return { ...db, properties: finalProps, rows };
}

/**
 * Migrate a whole collection. Object identity is preserved for databases that
 * needed no changes, so only migrated entities get re-persisted.
 */
export function migrateDatabases(map: DatabaseMap): DatabaseMap {
  let changed = false;
  const next: DatabaseMap = {};
  for (const [id, item] of Object.entries(map)) {
    // Folders share the collection but have no schema to migrate.
    if (isFolder(item)) {
      next[id] = item;
      continue;
    }
    const migrated: DbItem = migrateDatabase(item);
    if (migrated !== item) changed = true;
    next[id] = migrated;
  }
  return changed ? next : map;
}
