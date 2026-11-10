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
