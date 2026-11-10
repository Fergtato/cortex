import { uploadFile } from "@cortex/core";

// Images are uploaded to the Cortex server and entities store a
// `cortex-file:<id>` ref, rendered with <StoredImg>. Large images are
// downscaled in the browser first so a phone photo doesn't cost 8 MB.

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;

/** Downscales a picked image (if needed) and uploads it; returns its `cortex-file:` ref. */
export async function storeImageFile(file: File): Promise<string> {
  const blob = await downscale(file);
  return uploadFile(blob, file.name || "image");
}

/** Opens a file picker and resolves to the stored image ref, or null if cancelled / failed. */
export function pickImage(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(await storeImageFile(file));
      } catch (err) {
        console.error("[cortex] image upload failed:", err);
        resolve(null);
      }
    };
    input.click();
  });
}

/** Resizes to at most MAX_DIM on the long edge. GIF/SVG and small images pass through untouched. */
function downscale(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return Promise.resolve(file);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      if (scale >= 1) return resolve(file);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
      canvas.toBlob((b) => resolve(b ?? file), mime, JPEG_QUALITY);
    };
    img.src = url;
  });
}
