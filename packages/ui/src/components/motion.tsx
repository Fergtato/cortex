import { useEffect, useRef, useState } from "react";

/*
 * Small, instrument-like motion: numbers that count to their value and
 * titles that type out. Both render their final text for screen readers
 * and skip the animation under prefers-reduced-motion.
 */

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const NUM = /-?\d[\d,]*(?:\.\d+)?/;

/** Animates the first number inside a formatted string ("£1,284.50", "4.5", "¥72,740") from its previous value. */
export function CountUp({ text, duration = 650 }: { text: string; duration?: number }) {
  const m = NUM.exec(text);
  const target = m ? Number(m[0].replace(/,/g, "")) : NaN;
  const decimals = m && m[0].includes(".") ? m[0].split(".")[1].length : 0;
  const grouped = !!m && m[0].includes(",");
  const from = useRef<number>(0);
  const [shown, setShown] = useState(() => (reduced() || !m ? target : 0));

  useEffect(() => {
    if (!m || !Number.isFinite(target)) return;
    if (reduced()) return setShown(target);
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(a + (target - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = target;
    };
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m || !Number.isFinite(target)) return <>{text}</>;
  const num = shown.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped });
  return (
    <>
      <span aria-hidden>{text.slice(0, m.index) + num + text.slice(m.index + m[0].length)}</span>
      <span className="cx-sr">{text}</span>
    </>
  );
}

/** Types a title out once, with a block cursor; the full text reserves the space so nothing shifts. */
export function TypeText({ text, speed = 22 }: { text: string; speed?: number }) {
  const [n, setN] = useState(() => (reduced() ? text.length : 0));
  useEffect(() => {
    if (reduced()) return setN(text.length);
    setN(0);
    const id = window.setInterval(() => setN((c) => (c >= text.length ? (window.clearInterval(id), c) : c + 1)), Math.max(8, Math.min(speed, 500 / Math.max(1, text.length))));
    return () => window.clearInterval(id);
  }, [text, speed]);
  const done = n >= text.length;
  return (
    <span className="cx-type" aria-label={text}>
      <span aria-hidden>{text.slice(0, n)}</span>
      {!done && <span className="cx-type__cursor" aria-hidden />}
      <span className="cx-type__rest" aria-hidden>
        {text.slice(n)}
      </span>
    </span>
  );
}
