/*
 * TMDB's search matches words exactly, so "bladerunner", "blade runer" or
 * "roof man" can miss the title. When a search comes back thin, we try a
 * few spellings (spaces removed, a space inserted, the start of the word)
 * and rank everything by how close the title is to what was typed.
 */

/** Lowercase letters and digits only: "Blade Runner 2049" → "bladerunner2049". */
export const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 0..1: Dice coefficient on letter pairs of the squashed strings, with a boost when one starts the other. */
export function similarity(query: string, title: string): number {
  const a = squash(query);
  const b = squash(title);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  const dice = (2 * overlap) / Math.max(1, a.length - 1 + (b.length - 1));
  // One starting the other only counts when they're close in length ("bladerunn" ~ "bladerunner", not "inter" ~ "interstellar").
  const close = Math.min(a.length, b.length) / Math.max(a.length, b.length) >= 0.7;
  const prefix = close && (b.startsWith(a) || a.startsWith(b)) ? 0.15 : 0;
  return Math.min(0.99, dice + prefix);
}

/** Alternative queries worth sending to TMDB for a typed query, most promising first. */
export function variants(q: string): string[] {
  const out = new Set<string>();
  const trimmed = q.trim().replace(/\s+/g, " ");
  const joined = trimmed.replace(/\s+/g, "");
  if (joined !== trimmed) out.add(joined);
  // One long word: try a space at each point ("hotspot" → "hot spot").
  if (!trimmed.includes(" ") && trimmed.length >= 5 && trimmed.length <= 16) {
    for (let i = 2; i <= trimmed.length - 2; i++) out.add(`${trimmed.slice(0, i)} ${trimmed.slice(i)}`);
  }
  const words = trimmed.split(" ");
  // Several words: each one alone, so one misspelt word can't sink the rest ("blade runer" → "blade").
  if (words.length > 1) for (const w of words) if (w.length >= 4) out.add(w);
  // One long word: its start and its end catch a misspelling in the middle ("bladrunner" → "runner").
  if (words.length === 1 && trimmed.length >= 6) out.add(trimmed.slice(0, 4));
  if (words.length === 1 && trimmed.length >= 8) {
    out.add(trimmed.slice(0, 6));
    out.add(trimmed.slice(-6));
  }
  out.delete(trimmed);
  return [...out].slice(0, 20);
}
