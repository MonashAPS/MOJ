import { PageTabs as BasePageTabs, TitleRow as BaseTitleRow } from "@moj/ui";
import Link from "next/link";
import type { ComponentProps } from "react";

/** App navigation uses Next.js links; the shared UI defaults to plain anchors. */
export function PageTabs({ linkAs = Link, ...props }: ComponentProps<typeof BasePageTabs>) {
  return <BasePageTabs {...props} linkAs={linkAs} />;
}

export function TitleRow({ linkAs = Link, ...props }: ComponentProps<typeof BaseTitleRow>) {
  return <BaseTitleRow {...props} linkAs={linkAs} />;
}
