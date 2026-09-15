"use client";

import type { ContestDetail } from "@convex/contests";
import { cn, TitleRow } from "@moj/ui";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { JoinControl } from "@/components/contests/JoinControls";
import { ContestChips } from "@/components/contests/pieces";
import { contestTabs, joinKindFor } from "../tabs";

/**
 * The contest's heading over its submissions, so the page sits with the rest of
 * the contest rather than with the site's own list.
 *
 * Whose submissions to show is a choice within the page, not a tab of its own:
 * both are the contest's, and the contest already has enough tabs.
 */
export function ContestSubmissionsHeader({
  contestKey,
  detail,
  viewerUsername,
  scope,
}: {
  contestKey: string;
  detail: ContestDetail;
  viewerUsername: string | null;
  scope: "all" | "mine";
}) {
  const t = useTranslations("contests.submissions");
  const tabLabels = useTranslations("contests.tabs");
  const contest = detail.contest;
  const joinKind = joinKindFor(detail);

  const scopes = [
    { key: "all" as const, label: t("scopeAll"), href: `/contest/${contestKey}/submissions/` },
    ...(viewerUsername
      ? [
          {
            key: "mine" as const,
            label: t("scopeMine"),
            href: `/contest/${contestKey}/submissions/?mine=1`,
          },
        ]
      : []),
  ];

  return (
    <>
      <TitleRow
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {contest?.name ?? contestKey}
            {contest ? (
              <ContestChips
                isVisible={contest.isVisible}
                isPrivate={contest.isPrivate}
                isOrganizationPrivate={contest.isOrganizationPrivate}
                isRated={contest.isRated}
                organizations={contest.organizations}
                tags={contest.tags}
              />
            ) : null}
          </span>
        }
        tabs={contestTabs(detail, contestKey, tabLabels)}
        active="submissions"
        action={
          joinKind ? <JoinControl contestKey={contestKey} kind={joinKind} long size="default" /> : undefined
        }
      />

      {scopes.length > 1 ? (
        <div className="mb-4 inline-flex rounded-md border border-border bg-card p-0.5">
          {scopes.map((option) => (
            <Link
              key={option.key}
              href={option.href}
              aria-current={scope === option.key ? "page" : undefined}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium",
                scope === option.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {option.label}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
}
