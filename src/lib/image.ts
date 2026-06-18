// Images are stored inline as data URLs so they persist through whichever
// backend (localStorage or the SQLite API) is in use, with no upload endpoint.
// Large images are downscaled on import to keep the JSON payload reasonable.

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;

/** Opens a file picker and resolves to a (possibly downscaled) data URL. */
export function pickImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await fileToDataUrl(file));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const original = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(original);
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        if (scale >= 1) return resolve(original); // already small enough
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(original);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(mime, JPEG_QUALITY));
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}
