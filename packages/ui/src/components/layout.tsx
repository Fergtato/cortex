import { useState, type CSSProperties, type ReactNode } from "react";
import { cx, useControlled } from "../cx";
import { Icon, type IconName } from "./Icon";
import { Kbd } from "./controls";

export interface RailApp {
  id: string;
  label: string;
  icon: IconName;
  badge?: number | string;
  /** Pinned to the foot of the rail (Settings). */
  bottom?: boolean;
}

export interface AppRailProps {
  apps: RailApp[];
  active?: string;
  onSelect?: (id: string) => void;
  logo?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** The narrow app switcher on the far left of every screen. */
export function AppRail({ apps, active, onSelect, logo, footer, className }: AppRailProps) {
  const [cur, setCur] = useControlled(active, apps[0]?.id ?? "", onSelect);
  const btn = (a: RailApp) => (
    <button
      key={a.id}
      type="button"
      className="cx-rail__btn"
      title={a.label}
      aria-label={a.label}
      aria-current={cur === a.id ? "page" : undefined}
      onClick={() => setCur(a.id)}
    >
      <Icon name={a.icon} size={20} />
      {a.badge != null && <span className="cx-rail__badge">{a.badge}</span>}
    </button>
  );
  return (
    <nav className={cx("cx-rail", className)} aria-label="Apps">
      <div className="cx-rail__mark">{logo ?? "CX"}</div>
      {apps.filter((a) => !a.bottom).map(btn)}
      <div className="cx-rail__spacer" />
      {apps.filter((a) => a.bottom).map(btn)}
      {footer}
    </nav>
  );
}

export interface SidebarItem {
  id: string;
  label: string;
  icon?: IconName;
  count?: number | string;
  kbd?: string;
}

export interface SidebarSection {
  label?: string;
  items: SidebarItem[];
  add?: string;
  onAdd?: () => void;
}

export interface SidebarProps {
  title: ReactNode;
  actions?: ReactNode;
  sections?: SidebarSection[];
  active?: string;
  onSelect?: (id: string) => void;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** The current app's own navigation. Labelled sections collapse. */
export function Sidebar({ title, actions, sections = [], active, onSelect, footer, className, children }: SidebarProps) {
  const first = sections.flatMap((s) => s.items)[0]?.id ?? "";
  const [cur, setCur] = useControlled(active, first, onSelect);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return (
    <aside className={cx("cx-side", className)}>
      <div className="cx-side__head">
        <span className="cx-side__title">{title}</span>
        {actions && <span className="cx-side__actions">{actions}</span>}
      </div>
      <div className="cx-side__body">
        {children}
        {sections.map((s, si) => {
          const key = s.label ?? `s${si}`;
          const shut = !!collapsed[key];
          return (
            <div key={key} className="cx-side__section">
              {s.label && (
                <button
                  type="button"
                  className="cx-side__group"
                  aria-expanded={!shut}
                  onClick={() => setCollapsed({ ...collapsed, [key]: !shut })}
                >
                  <Icon name={shut ? "chevron-right" : "chevron-down"} size={12} />
                  {s.label}
                </button>
              )}
              {!shut && (
                <ul className="cx-side__list">
                  {s.items.map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        className="cx-nav"
                        aria-current={cur === it.id ? "page" : undefined}
                        onClick={() => setCur(it.id)}
                      >
                        {it.icon && <Icon name={it.icon} size={16} />}
                        <span className="cx-nav__label">{it.label}</span>
                        {it.count != null && <span className="cx-nav__count">{it.count}</span>}
                        {it.kbd && <Kbd>{it.kbd}</Kbd>}
                      </button>
                    </li>
                  ))}
                  {s.add && (
                    <li>
                      <button type="button" className="cx-nav cx-nav--add" onClick={s.onAdd}>
                        <Icon name="plus" size={16} />
                        <span className="cx-nav__label">{s.add}</span>
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {footer && <div className="cx-side__foot">{footer}</div>}
    </aside>
  );
}

export interface TopBarProps {
  crumbs: ReactNode[];
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** The canvas header: breadcrumb on the left, at most one primary action on the right. */
export function TopBar({ crumbs, actions, className, children }: TopBarProps) {
  return (
    <header className={cx("cx-top", className)}>
      <nav aria-label="Breadcrumb">
        <ol className="cx-crumbs">
          {crumbs.map((c, i) => (
            <li key={i} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
              {c}
            </li>
          ))}
        </ol>
      </nav>
      {children}
      {actions && <div className="cx-top__actions">{actions}</div>}
    </header>
  );
}

export interface AppShellProps {
  rail?: ReactNode;
  sidebar?: ReactNode;
  topbar?: ReactNode;
  /** `dots` = the editable-dashboard canvas. */
  canvas?: "plain" | "dots";
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}

/** The frame every app renders inside. */
export function AppShell({ rail, sidebar, topbar, canvas, style, className, children }: AppShellProps) {
  return (
    <div className={cx("cx-shell", className)} style={style}>
      {rail}
      {sidebar}
      <main className="cx-main">
        {topbar}
        <div className={cx("cx-canvas", canvas === "dots" && "cx-canvas--dots")}>{children}</div>
      </main>
    </div>
  );
}
