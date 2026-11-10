import type { ImgHTMLAttributes } from "react";
import { api } from "./api";

/** Stored files are referenced as `cortex-file:<id>` in entity data. */
export const FILE_REF_PREFIX = "cortex-file:";

export function isFileRef(src: string | null | undefined): src is string {
  return !!src && src.startsWith(FILE_REF_PREFIX);
}

/** Uploads a file for the signed-in user and returns its `cortex-file:` ref. */
export async function uploadFile(file: Blob, name = "file"): Promise<string> {
  const form = new FormData();
  form.append("file", file, name);
  const { id } = await api<{ id: string }>("/files", { method: "POST", body: form });
  return FILE_REF_PREFIX + id;
}

/**
 * The URL an `<img>` can load for a stored src. Refs map to the server's file
 * route, which checks the session cookie, so no signed URLs are needed.
 * Data URLs and external URLs pass through unchanged.
 */
export function storedSrc(src: string | null | undefined): string | undefined {
  if (!src) return undefined;
  if (isFileRef(src)) return `/api/files/${encodeURIComponent(src.slice(FILE_REF_PREFIX.length))}`;
  return src;
}

/** Hook form kept for parity with v0 call sites. */
export const useStoredSrc = storedSrc;

/** Drop-in `<img>` that understands `cortex-file:` refs. */
export function StoredImg({
  src,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string | undefined | null }) {
  const resolved = storedSrc(src);
  if (!resolved) return null;
  return <img src={resolved} {...rest} />;
}

/* ---- picking + downscaling images ---- */

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
