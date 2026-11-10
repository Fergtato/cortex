import { useRef, useState } from "react";
import type { CellValue, PropertyDef } from "../../../types";
import type { WidgetProps } from "./registry";
import { patchWidgetConfig } from "./registry";
import { DbSelect, strConf, resolveDefaultValue, TODAY_SENTINEL } from "./dbShared";
import { Cell } from "../../database/Cell";
import { isComputedType } from "../../../lib/formula";

type FieldMode = "skip" | "input" | "default";

interface FormField {
  propId: string;
  mode: FieldMode;
  /** Preset cell value for `default` fields. */
  value?: CellValue;
}

function fieldsOf(config: Record<string, unknown>): FormField[] {
  return Array.isArray(config.fields) ? (config.fields as FormField[]) : [];
}

/** Properties a form can set (computed types never write to cells). */
function writableProps(props: PropertyDef[]): PropertyDef[] {
  return props.filter((p) => !isComputedType(p.type));
}

function isBlank(v: CellValue | undefined): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

/**
 * Quick-entry form for a database: chosen properties render as typed inputs
 * (Cell editors — selects get their pill UI, dates a date input, …), others
 * submit silently with a preset default. Enter or the submit button adds the
 * row and clears the inputs.
 */
export function FormWidget({ widget, store }: WidgetProps) {
  const dbId = strConf(widget.config, "databaseId");
  const title = strConf(widget.config, "title");
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const [draft, setDraft] = useState<Record<string, CellValue>>({});
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<number | undefined>(undefined);

  const fields = fieldsOf(widget.config);
  const inputFields = fields.filter((f) => f.mode === "input");

  if (!db || inputFields.length === 0) {
    return <div className="dw-unconfigured">choose a database + fields in ⚙</div>;
  }

  function submit() {
    if (!db) return;
    const cells: Record<string, CellValue> = {};
    for (const f of fields) {
      if (f.mode === "default" && !isBlank(f.value)) {
        cells[f.propId] = resolveDefaultValue(f.value!);
      }
      if (f.mode === "input" && !isBlank(draft[f.propId])) cells[f.propId] = draft[f.propId];
    }
    if (Object.keys(cells).length === 0) return;
    store.addRow(db.id, cells);
    setDraft({});
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 1500);
  }

  return (
    <div
      className="dw-form"
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="dw-form-title">{title || `+ ${db.name || "untitled"}`}</div>
      <div className="dw-form-fields">
        {inputFields.map((f) => {
          const prop = db.properties.find((p) => p.id === f.propId);
          if (!prop) return null;
          return (
            <label key={f.propId} className="dw-form-field">
              <span className="dw-form-field-name">{prop.name}</span>
              <Cell
                dbId={db.id}
                prop={prop}
                value={draft[f.propId] ?? null}
                store={store}
                onChange={(v) => setDraft((d) => ({ ...d, [f.propId]: v }))}
              />
            </label>
          );
        })}
      </div>
      <button className={`meta-btn dw-form-submit${flash ? " flashed" : ""}`} onClick={submit}>
        {flash ? "✓ added" : strConf(widget.config, "submitLabel") || "⏎ add"}
      </button>
    </div>
  );
}

export function FormConfigForm({ widget, dash, store }: WidgetProps) {
  const set = (patch: Record<string, unknown>) =>
    patchWidgetConfig(store, dash.id, widget.id, patch);
  const dbId = strConf(widget.config, "databaseId");
  const db = dbId ? store.getDatabase(dbId) : undefined;
  const fields = fieldsOf(widget.config);
  const fieldFor = (propId: string): FormField =>
    fields.find((f) => f.propId === propId) ?? { propId, mode: "skip" };

  function patchField(propId: string, patch: Partial<FormField>) {
    const next = writableProps(db?.properties ?? [])
      .map((p) => ({ ...fieldFor(p.id), ...(p.id === propId ? patch : {}) }))
      .filter((f) => f.mode !== "skip");
    set({ fields: next });
  }

  return (
    <div className="dw-config-form dw-form-config">
      <label className="dw-config-label">database</label>
      <DbSelect
        store={store}
        value={dbId}
        onChange={(id) => {
          const target = store.getDatabase(id);
          // Sensible default: first (title) property as the one input field.
          const first = target ? writableProps(target.properties)[0] : undefined;
          set({ databaseId: id, fields: first ? [{ propId: first.id, mode: "input" }] : [] });
        }}
      />
      {db && (
        <>
          <label className="dw-config-label">fields</label>
          {writableProps(db.properties).map((p) => {
            const f = fieldFor(p.id);
            return (
              <div key={p.id} className="dw-form-config-row">
                <span className="dw-form-field-name">{p.name}</span>
                <select
                  className="dw-config-select dw-form-mode"
                  value={f.mode}
                  onChange={(e) => patchField(p.id, { mode: e.target.value as FieldMode })}
                >
                  <option value="skip">skip</option>
                  <option value="input">input</option>
                  <option value="default">default</option>
                </select>
                {f.mode === "default" && (
                  <div className="dw-form-default">
                    {p.type === "date" && (
                      <button
                        className={`opt-btn${f.value === TODAY_SENTINEL ? " active" : ""}`}
                        title="Always use the date at submit time"
                        onClick={() =>
                          patchField(p.id, {
                            value: f.value === TODAY_SENTINEL ? null : TODAY_SENTINEL,
                          })
                        }
                      >
                        current date
                      </button>
                    )}
                    {f.value !== TODAY_SENTINEL && (
                      <Cell
                        dbId={db.id}
                        prop={p}
                        value={f.value ?? null}
                        store={store}
                        onChange={(v) => patchField(p.id, { value: v })}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <label className="dw-config-label">title (optional)</label>
          <input
            className="cell-input dw-config-input"
            value={strConf(widget.config, "title")}
            placeholder={`+ ${db.name}`}
            onChange={(e) => set({ title: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </>
      )}
    </div>
  );
}
