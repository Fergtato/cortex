import { isSupabaseMode } from "../storage/datasource";
import { FILES_BUCKET, currentUserId, getSupabase } from "./supabase";

// Image storage depends on the data source:
//  - localStorage: images are inlined as data URLs in the entity JSON.
//  - Supabase: images are uploaded to the private `cortex-files` bucket and the
//    entity stores a `cortex-file:<path>` ref, resolved to a short-lived
//    signed URL at render time (see components/StoredImg.tsx).
// Large images are downscaled on import either way.

/** Prefix of an image src that points into Supabase Storage. */
export const FILE_REF_PREFIX = "cortex-file:";

export function isFileRef(src: string | undefined | null): src is string {
  return typeof src === "string" && src.startsWith(FILE_REF_PREFIX);
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

/**
 * Random file id. crypto.randomUUID only exists in secure contexts (https or
 * localhost), and Cortex is often served over plain http on a LAN, so fall
 * back to getRandomValues (available everywhere).
 */
function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Upload a data URL to Supabase Storage and return its `cortex-file:` ref. */
export async function uploadDataUrl(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const mime = blob.type || "image/png";
  const ext = EXT_BY_MIME[mime] ?? "bin";
  const uid = await currentUserId();
  const path = `${uid}/${randomId()}.${ext}`;
  const { error } = await getSupabase()
    .storage.from(FILES_BUCKET)
    .upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw new Error(`image upload failed: ${error.message}`);
  return FILE_REF_PREFIX + path;
}

/**
 * Turn a picked file into the value to store: a data URL (localStorage) or an
 * uploaded `cortex-file:` ref (Supabase).
 */
export async function storeImageFile(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  return isSupabaseMode() ? uploadDataUrl(dataUrl) : dataUrl;
}

const MAX_DIM = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Opens a file picker and resolves to the stored image value (a downscaled
 * data URL, or a Supabase Storage ref), or null if cancelled / failed.
 */
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
        console.error("[cortex] image import failed:", err);
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
