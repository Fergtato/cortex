import type { Database, DatabaseRow, DatabaseView, PropertyDef } from "../../types";
import type { Store } from "../../store";
import { Cell } from "./Cell";
import { pickImage } from "../../lib/image";

interface Props {
  db: Database;
  store: Store;
  rows: DatabaseRow[];
  view: DatabaseView;
  /** Minimal chrome: hide the new-card button and card-delete controls. */
  minimal?: boolean;
}

export function GalleryView({ db, store, rows, view, minimal }: Props) {
  const [titleProp, ...rest] = db.properties;
  // First image property becomes the card cover; the rest are listed below.
  const imageProp = db.properties.find((p) => p.type === "image");
  const fieldProps = rest.filter((p) => p.id !== imageProp?.id);
  // "fill" crops to cover the 4:3 cover area (default); "fit" letterboxes.
  const fit = view.coverFit ?? "fill";

  return (
    <div className="db-gallery-wrap">
      {!minimal && imageProp && (
        <div className="gallery-config">
          <span className="db-control-label">image</span>
          <button
            className={`db-control-btn${fit === "fill" ? " active" : ""}`}
            title="Crop images to fill the cover"
            onClick={() => store.updateView(db.id, view.id, { coverFit: "fill" })}
          >
            fill
          </button>
          <button
            className={`db-control-btn${fit === "fit" ? " active" : ""}`}
            title="Letterbox images to fit the cover"
            onClick={() => store.updateView(db.id, view.id, { coverFit: "fit" })}
          >
            fit
          </button>
        </div>
      )}
      <div className="db-gallery">
        {rows.map((row) => (
          <div key={row.id} className="gallery-card">
            {imageProp && (
              <Cover db={db} store={store} row={row} prop={imageProp} fit={fit} />
            )}
            <div className="card-head">
              <input
                className="card-title"
                placeholder="untitled"
                value={
                  typeof row.cells[titleProp.id] === "string"
                    ? (row.cells[titleProp.id] as string)
                    : ""
                }
                onChange={(e) =>
                  store.updateCell(db.id, row.id, titleProp.id, e.target.value || null)
                }
              />
              {!minimal && (
                <button
                  className="row-del"
                  title="Delete item"
                  onClick={() => store.deleteRow(db.id, row.id)}
                >
                  ×
                </button>
              )}
            </div>
            <div className="card-fields">
              {fieldProps.map((prop) => (
                <div key={prop.id} className="card-field">
                  <span className="card-label">{prop.name}</span>
                  <Cell
                    dbId={db.id}
                    prop={prop}
                    value={row.cells[prop.id] ?? null}
                    store={store}
                    onChange={(v) => store.updateCell(db.id, row.id, prop.id, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!minimal && (
        <button className="add-row-btn" onClick={() => store.addRow(db.id)}>
          + new card
        </button>
      )}
    </div>
  );
}

function Cover({
  db,
  store,
  row,
  prop,
  fit,
}: {
  db: Database;
  store: Store;
  row: DatabaseRow;
  prop: PropertyDef;
  fit: "fit" | "fill";
}) {
  const v = row.cells[prop.id];
  const src = typeof v === "string" ? v : "";

  const pick = async () => {
    const url = await pickImage();
    if (url) store.updateCell(db.id, row.id, prop.id, url);
  };

  return (
    <div className="gallery-cover" onClick={pick} title="Click to set image">
      {src ? (
        <>
          <img src={src} className={`gallery-cover-img cover-${fit}`} alt="" />
          <button
            className="gallery-cover-del"
            title="Remove image"
            onClick={(e) => {
              e.stopPropagation();
              store.updateCell(db.id, row.id, prop.id, null);
            }}
          >
            ×
          </button>
        </>
      ) : (
        <span className="gallery-cover-empty">+ image</span>
      )}
    </div>
  );
}
