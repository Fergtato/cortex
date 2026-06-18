import type { Database, DatabaseRow, PropertyDef } from "../../types";
import type { Store } from "../../store";
import { Cell } from "./Cell";
import { pickImage } from "../../lib/image";

interface Props {
  db: Database;
  store: Store;
  rows: DatabaseRow[];
}

export function GalleryView({ db, store, rows }: Props) {
  const [titleProp, ...rest] = db.properties;
  // First image property becomes the card cover; the rest are listed below.
  const imageProp = db.properties.find((p) => p.type === "image");
  const fieldProps = rest.filter((p) => p.id !== imageProp?.id);

  return (
    <div className="db-gallery-wrap">
      <div className="db-gallery">
        {rows.map((row) => (
          <div key={row.id} className="gallery-card">
            {imageProp && (
              <Cover db={db} store={store} row={row} prop={imageProp} />
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
              <button
                className="row-del"
                title="Delete item"
                onClick={() => store.deleteRow(db.id, row.id)}
              >
                ×
              </button>
            </div>
            <div className="card-fields">
              {fieldProps.map((prop) => (
                <div key={prop.id} className="card-field">
                  <span className="card-label">{prop.name}</span>
                  <Cell
                    prop={prop}
                    value={row.cells[prop.id] ?? null}
                    onChange={(v) => store.updateCell(db.id, row.id, prop.id, v)}
                    onAddOption={(opt) =>
                      store.updateProperty(db.id, prop.id, {
                        options: [...(prop.options ?? []), opt],
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <button className="add-row-btn" onClick={() => store.addRow(db.id)}>
        + new card
      </button>
    </div>
  );
}

function Cover({
  db,
  store,
  row,
  prop,
}: {
  db: Database;
  store: Store;
  row: DatabaseRow;
  prop: PropertyDef;
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
          <img src={src} className="gallery-cover-img" alt="" />
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
