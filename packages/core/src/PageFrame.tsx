import type { ReactNode } from "react";
import { TopBar, cx } from "@cortex/ui";

export interface PageFrameProps {
  crumbs: ReactNode[];
  actions?: ReactNode;
  /** `dots` = the editable-dashboard canvas. */
  canvas?: "plain" | "dots";
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}

/** Topbar + scrolling canvas: what every module Page renders inside the shell's main column. */
export function PageFrame({ crumbs, actions, canvas, title, subtitle, children }: PageFrameProps) {
  return (
    <>
      <TopBar crumbs={crumbs} actions={actions} />
      <div className={cx("cx-canvas", canvas === "dots" && "cx-canvas--dots")}>
        {title && (
          <div className="cx-page-head">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
