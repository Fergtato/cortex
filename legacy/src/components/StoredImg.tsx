import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { FILE_REF_PREFIX, isFileRef } from "../lib/image";
import { FILES_BUCKET, getSupabase } from "../lib/supabase";

/**
 * Resolves image sources stored by the app into something an <img> can load.
 * `cortex-file:<path>` refs (Supabase Storage, private bucket) become signed
 * URLs; data URLs and external URLs pass through unchanged.
 *
 * Signed URLs are cached per path and refreshed before they expire. Lookups
 * made in the same tick are batched into a single createSignedUrls call, so a
 * gallery full of images costs one request.
 */

const TTL_SECONDS = 60 * 60;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface Entry {
  url: string;
  expiresAt: number;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string>>();
let batch: { path: string; resolve: (u: string) => void; reject: (e: unknown) => void }[] = [];
let scheduled = false;

function flush() {
  scheduled = false;
  const items = batch;
  batch = [];
  const paths = [...new Set(items.map((i) => i.path))];
  getSupabase()
    .storage.from(FILES_BUCKET)
    .createSignedUrls(paths, TTL_SECONDS)
    .then(({ data, error }) => {
      if (error) throw error;
      const byPath = new Map<string, string>();
      for (const row of data ?? []) {
        if (row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
      }
      const expiresAt = Date.now() + TTL_SECONDS * 1000;
      for (const item of items) {
        const url = byPath.get(item.path);
        inflight.delete(item.path);
        if (url) {
          cache.set(item.path, { url, expiresAt });
          item.resolve(url);
        } else {
          item.reject(new Error(`no signed url for ${item.path}`));
        }
      }
    })
    .catch((err) => {
      for (const item of items) {
        inflight.delete(item.path);
        item.reject(err);
      }
    });
}

function signedUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt - Date.now() > REFRESH_MARGIN_MS) return Promise.resolve(hit.url);
  const pending = inflight.get(path);
  if (pending) return pending;
  const p = new Promise<string>((resolve, reject) => {
    batch.push({ path, resolve, reject });
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(flush);
    }
  });
  inflight.set(path, p);
  return p;
}

function cachedNow(src: string | undefined | null): string | undefined {
  if (!src) return undefined;
  if (!isFileRef(src)) return src;
  const hit = cache.get(src.slice(FILE_REF_PREFIX.length));
  return hit && hit.expiresAt > Date.now() ? hit.url : undefined;
}

/** Hook form: the loadable URL for a stored image src (undefined while resolving). */
export function useStoredSrc(src: string | undefined | null): string | undefined {
  const [resolved, setResolved] = useState<string | undefined>(() => cachedNow(src));

  useEffect(() => {
    if (!isFileRef(src)) {
      setResolved(src ?? undefined);
      return;
    }
    let cancelled = false;
    let timer: number | undefined;
    const path = src.slice(FILE_REF_PREFIX.length);
    const load = () => {
      signedUrl(path)
        .then((url) => {
          if (cancelled) return;
          setResolved(url);
          // Re-sign shortly before expiry for long-lived views.
          const entry = cache.get(path);
          if (entry) {
            timer = window.setTimeout(
              load,
              Math.max(10_000, entry.expiresAt - Date.now() - REFRESH_MARGIN_MS + 1000)
            );
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error("[cortex] could not resolve image:", err);
            setResolved(undefined);
          }
        });
    };
    setResolved(cachedNow(src));
    load();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [src]);

  return resolved;
}

/** Drop-in <img> that understands `cortex-file:` refs. */
export function StoredImg({
  src,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string | undefined | null }) {
  const resolved = useStoredSrc(src);
  if (!resolved) return <span className={`${rest.className ?? ""} stored-img-loading`.trim()} />;
  return <img src={resolved} {...rest} />;
}
