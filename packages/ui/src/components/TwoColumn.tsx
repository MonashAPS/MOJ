import type { ReactNode } from "react";
import { cn } from "../cn";

/** DMOJ's `common-content`: main column plus a sticky `.info-float` sidebar that
 *  stacks underneath below 700 px. */
export function TwoColumn({
  children,
  side,
  className,
}: {
  children: ReactNode;
  side?: ReactNode;
  className?: string;
}) {
  return (
    <div id="common-content" className={className}>
      <div id="content-left">{children}</div>
      {side ? (
        <div id="content-right">
          <div className="info-float">{side}</div>
        </div>
      ) : null}
    </div>
  );
}

export function InfoBox({
  title,
  children,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius)",
        padding: "10px 12px",
        marginBottom: "12px",
      }}
    >
      {title ? (
        <h3 style={{ fontSize: "1.05em", marginBottom: "0.4em", color: "var(--ink-2)" }}>{title}</h3>
      ) : null}
      {children}
    </section>
  );
}
