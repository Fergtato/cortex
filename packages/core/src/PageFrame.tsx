import { isValidElement, useLayoutEffect, useRef, type ReactNode } from "react";
import { TopBar, TypeText, cx } from "@cortex/ui";
import { splitPath, useRouter } from "./router";

/** A breadcrumb: plain text, a node, or a label with a destination. */
export type Crumb = ReactNode | { label: ReactNode; to: string };

export interface PageFrameProps {
  /**
   * Breadcrumbs. Give `{ label, to }` to make one a link. A plain first crumb
   * links to the app's start page automatically when there's more than one.
   */
  crumbs: Crumb[];
  actions?: ReactNode;
  /** `dots` = the editable-dashboard canvas. */
  canvas?: "plain" | "dots";
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}

const isLink = (c: Crumb): c is { label: ReactNode; to: string } => !!c && typeof c === "object" && !isValidElement(c) && "to" in (c as object);

/* Scroll memory: each address keeps its canvas scroll position, so going back lands where you were. */
const scrolls = new Map<string, number>();

/** Topbar + scrolling canvas: what every module Page renders inside the shell's main column. */
export function PageFrame({ crumbs, actions, canvas, title, subtitle, children }: PageFrameProps) {
  const { path, search, navigate } = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const key = path + search;
  const { moduleId } = splitPath(path);
  const root = moduleId ? `/${moduleId}` : "/";

  const items = crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    const link = isLink(c) ? c : i === 0 && !last && typeof c === "string" && path !== root ? { label: c, to: root } : null;
    if (link && !last) {
      return (
        <a
          key={i}
          href={link.to}
          className="cx-crumb-link"
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            navigate(link.to);
          }}
        >
          {link.label}
        </a>
      );
    }
    return isLink(c) ? c.label : c;
  });

  // Replay the entrance on each page change without remounting the content (Notes keeps one editor instance).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("cx-enter");
    void el.offsetWidth;
    el.classList.add("cx-enter");
  }, [path]);

  // Restore this address's scroll position; content that loads async (grids, lists) gets a few tries.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = scrolls.get(key) ?? 0;
    el.scrollTop = target;
    let tries = 0;
    const timer = target
      ? window.setInterval(() => {
          if (el.scrollTop >= target - 2 || ++tries > 20) return window.clearInterval(timer);
          el.scrollTop = target;
        }, 50)
      : 0;
    const onScroll = () => scrolls.set(key, el.scrollTop);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearInterval(timer);
      el.removeEventListener("scroll", onScroll);
    };
  }, [key]);

  return (
    <>
      <TopBar crumbs={items} actions={actions}>
        {/* a hairline that sweeps under the topbar on every page change */}
        <span key={path} className="cx-top__scan" aria-hidden />
      </TopBar>
      <div ref={ref} className={cx("cx-canvas", canvas === "dots" && "cx-canvas--dots")}>
        {title && (
          <div className="cx-page-head">
            <h1>{typeof title === "string" ? <TypeText text={title} /> : title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
