import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDialog, useRouter } from "@cortex/core";
import { Button, Checkbox, Icon } from "@cortex/ui";
import { formatIngredientAmount, type Ingredient, type Recipe } from "../shared/types";
import { BASE, readTicks, usePatchRecipe, writeTicks } from "./data";
import { Highlight } from "./recipe";

/*
 * Cook mode: one step at a time, big type, full screen. Step timers keep
 * running while you move between steps and chime when they finish. The
 * screen stays awake where the browser allows it (Wake Lock needs HTTPS).
 * Keys: ← → to move, Esc to leave. Swipe on phones.
 */

interface Timer {
  id: string;
  step: number;
  label: string;
  total: number;
  /** ms left when paused; null while running. */
  left: number | null;
  endsAt: number;
  done: boolean;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = i === 2 ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
    setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* no audio: the timer still flashes */
  }
  navigator.vibrate?.([200, 100, 200]);
}

/** Ingredients a step mentions (by full name or its last word). */
function usedIn(text: string, ingredients: Ingredient[]): Ingredient[] {
  const t = text.toLowerCase();
  return ingredients.filter((i) => {
    const n = i.name.toLowerCase().trim();
    const last = n.split(/\s+/).pop() ?? "";
    return (n.length >= 3 && t.includes(n)) || (last.length >= 4 && new RegExp(`\\b${last.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t));
  });
}

function useWakeLock() {
  const [state, setState] = useState<"on" | "off" | "unsupported">("off");
  useEffect(() => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    if (!wl || !window.isSecureContext) {
      setState("unsupported");
      return;
    }
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const get = () =>
      wl
        .request("screen")
        .then((l) => {
          if (!alive) return void l.release();
          lock = l;
          setState("on");
        })
        .catch(() => setState("off"));
    void get();
    const onVis = () => document.visibilityState === "visible" && void get();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);
  return state;
}

export function CookMode({ recipe }: { recipe: Recipe }) {
  const { navigate, search } = useRouter();
  const dialog = useDialog();
  const patch = usePatchRecipe();
  const serves = Number(new URLSearchParams(search).get("serves")) || recipe.servings;
  const factor = serves / recipe.servings;
  const steps = recipe.steps;
  const [i, setI] = useState(0);
  const [showIngr, setShowIngr] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const [ticks, setTicks] = useState<string[]>(() => readTicks(recipe.id));
  const [timers, setTimers] = useState<Timer[]>([]);
  const [, setNow] = useState(0);
  const wake = useWakeLock();
  const step = steps[i];
  const last = i === steps.length - 1;
  const used = useMemo(() => (step ? usedIn(`${step.title} ${step.text}`, recipe.ingredients) : []), [step, recipe.ingredients]);
  const back = `${BASE}/r/${recipe.id}`;

  const go = useCallback((n: number) => setI((cur) => Math.max(0, Math.min(steps.length - 1, cur + n))), [steps.length]);
  const close = useCallback(() => navigate(back), [navigate, back]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, .cx-dialog")) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, close]);

  // Tick while any timer runs; chime once when one reaches zero.
  const running = timers.some((t) => t.left === null && !t.done);
  useEffect(() => {
    if (!running) return;
    const h = setInterval(() => {
      const now = Date.now();
      setNow(now);
      setTimers((ts) => {
        let rang = false;
        const next = ts.map((t) => {
          if (t.left === null && !t.done && t.endsAt <= now) {
            rang = true;
            return { ...t, done: true };
          }
          return t;
        });
        if (rang) chime();
        return rang ? next : ts;
      });
    }, 250);
    return () => clearInterval(h);
  }, [running]);

  // Swipe between steps on touch screens.
  const touch = useRef<{ x: number; y: number } | null>(null);

  const startTimer = () => {
    if (!step?.minutes) return;
    const total = step.minutes * 60_000;
    setTimers((ts) => [...ts.filter((t) => t.step !== i), { id: `${i}-${Date.now()}`, step: i, label: step.title || `Step ${i + 1}`, total, left: null, endsAt: Date.now() + total, done: false }]);
  };
  const toggleTimer = (id: string) =>
    setTimers((ts) => ts.map((t) => (t.id !== id || t.done ? t : t.left === null ? { ...t, left: t.endsAt - Date.now() } : { ...t, left: null, endsAt: Date.now() + (t.left ?? 0) })));
  const dropTimer = (id: string) => setTimers((ts) => ts.filter((t) => t.id !== id));
  const toggleTick = (id: string, on: boolean) => {
    const next = on ? [...ticks, id] : ticks.filter((x) => x !== id);
    setTicks(next);
    writeTicks(recipe.id, next);
  };
  const finish = async () => {
    if (await dialog.confirm(`Mark “${recipe.title}” as cooked today?`, { confirmLabel: "Mark as cooked" })) patch.mutate({ id: recipe.id, cooked: true });
    close();
  };
  const stepTimer = timers.find((t) => t.step === i);

  if (!step)
    return (
      <div className="rc-cook">
        <p className="rc-muted rc-pad">This recipe has no steps yet.</p>
        <Button onClick={close}>Back</Button>
      </div>
    );

  return (
    <div className="rc-cook" role="dialog" aria-modal="true" aria-label={`Cook mode: ${recipe.title}`}>
      <header className="rc-cook__top">
        <Button size="sm" variant="ghost" icon="x" aria-label="Leave cook mode" onClick={close} />
        <span className="rc-cook__name">{recipe.title}</span>
        <span className="rc-cook__count">
          Step {i + 1} <span className="rc-muted">of {steps.length}</span>
        </span>
        <Button size="sm" variant={showIngr ? "secondary" : "ghost"} icon="list" onClick={() => setShowIngr((v) => !v)} aria-pressed={showIngr}>
          Ingredients
        </Button>
      </header>
      <nav className="rc-cook__progress" aria-label="Steps">
        {steps.map((s, n) => (
          <button key={s.id} type="button" className={n < i ? "is-done" : n === i ? "is-on" : ""} aria-label={`Step ${n + 1}${s.title ? `: ${s.title}` : ""}`} aria-current={n === i ? "step" : undefined} onClick={() => setI(n)} />
        ))}
      </nav>

      <div className={`rc-cook__body${showIngr ? " has-side" : ""}`}>
        <main
          className="rc-cook__main"
          onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            const t = touch.current;
            touch.current = null;
            if (!t) return;
            const dx = e.changedTouches[0].clientX - t.x;
            const dy = e.changedTouches[0].clientY - t.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}
        >
          <div className="rc-cook__step" key={step.id}>
            <div className="rc-cook__head">
              <span className="rc-cook__n">{i + 1}</span>
              {step.title && <h2 className="rc-cook__title">{step.title}</h2>}
            </div>
            <p className="rc-cook__text">
              <Highlight text={step.text} names={recipe.ingredients.map((x) => x.name)} />
            </p>
            {used.length > 0 && (
              <div className="rc-cook__used">
                <span className="cx-label">For this step</span>
                <ul>
                  {used.map((x) => (
                    <li key={x.id}>
                      <span className="rc-cook__amt">{formatIngredientAmount(x, factor)}</span> {x.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(step.minutes || step.handsOff) && (
              <div className="rc-cook__timerrow">
                {step.minutes ? (
                  stepTimer ? (
                    <span className="rc-muted">Timer running below</span>
                  ) : (
                    <Button variant="secondary" icon="clock" onClick={startTimer}>
                      Start {step.minutes} min timer
                    </Button>
                  )
                ) : null}
                {step.handsOff && <span className="rc-chip rc-chip--soft">Hands-off: carry on with the next step</span>}
              </div>
            )}
          </div>
        </main>
        {showIngr && (
          <aside className="rc-cook__side" aria-label="Ingredients">
            <span className="cx-label">
              Ingredients · {serves} {serves === 1 ? "serving" : "servings"}
            </span>
            <ul className="rc-ingr__list">
              {recipe.ingredients.map((x) => {
                const on = ticks.includes(x.id);
                const now = used.includes(x);
                return (
                  <li key={x.id} className={`${on ? "is-on" : ""}${now ? " is-now" : ""}`}>
                    <Checkbox checked={on} onChange={(v) => toggleTick(x.id, v)} label={x.name} className="rc-ingr__check" />
                    <span className="rc-ingr__amt">{formatIngredientAmount(x, factor)}</span>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
      </div>

      <footer className="rc-cook__foot">
        <Button variant="ghost" icon="chevron-left" disabled={i === 0} onClick={() => go(-1)}>
          Previous
        </Button>
        <div className="rc-cook__timers" aria-live="polite">
          {timers.map((t) => {
            const left = t.done ? 0 : t.left ?? t.endsAt - Date.now();
            return (
              <span key={t.id} className={`rc-timer${t.done ? " is-done" : ""}${t.left !== null && !t.done ? " is-paused" : ""}`}>
                <button type="button" className="rc-timer__main" onClick={() => (t.done ? dropTimer(t.id) : toggleTimer(t.id))} title={t.done ? "Dismiss" : t.left === null ? "Pause" : "Resume"}>
                  <span className="rc-timer__label">
                    {t.step + 1}. {t.label}
                  </span>
                  <span className="rc-timer__time">{t.done ? "Done" : fmt(left)}</span>
                </button>
                <button type="button" className="rc-timer__x" aria-label="Remove timer" onClick={() => dropTimer(t.id)}>
                  <Icon name="x" size={12} />
                </button>
                <span className="rc-timer__bar" style={{ transform: `scaleX(${t.done ? 1 : 1 - left / t.total})` }} />
              </span>
            );
          })}
          {!timers.length && wake === "unsupported" && <span className="rc-muted rc-small">Keep-awake needs HTTPS: your screen may dim.</span>}
          {!timers.length && wake === "on" && <span className="rc-muted rc-small">Screen stays on</span>}
        </div>
        {last ? (
          <Button variant="primary" icon="check" onClick={finish}>
            Finish
          </Button>
        ) : (
          <Button variant="primary" className="rc-next" onClick={() => go(1)}>
            Next <Icon name="chevron-right" size={14} />
          </Button>
        )}
      </footer>
    </div>
  );
}
