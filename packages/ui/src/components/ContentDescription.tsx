import type { ReactNode } from "react";
import { cn } from "../cn";

/** Statement / blog / comment typography. Pass `html` for sanitised markdown
 *  output from @moj/content, or children for React content. */
export function ContentDescription({
  html,
  children,
  className,
}: {
  html?: string;
  children?: ReactNode;
  className?: string;
}) {
  if (html !== undefined) {
    return (
      <div
        className={cn("content-description", className)}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitised upstream by @moj/content
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <div className={cn("content-description", className)}>{children}</div>;
}
