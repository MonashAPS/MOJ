"use client";

import { api } from "@convex/_generated/api";
import type { OrganizationStandingsPayload, StandingsOrganization } from "@convex/scoreboard/organizations";
import { Button } from "@moj/ui";
import { useQuery } from "convex/react";
import { ChevronRight, LayoutGrid, Snowflake } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import "@/components/scoreboard/hall.css";

function formatScore(value: number): string {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 2 });
}

function OrganizationLogo({ organization }: { organization: StandingsOrganization }) {
  if (organization.logoUrl) {
    return <img className="hall-org-logo" src={organization.logoUrl} alt="" />;
  }

  return (
    <span className="hall-org-logo" data-fallback="true" aria-hidden>
      {(organization.shortName || organization.name).slice(0, 1)}
    </span>
  );
}

/**
 * The organisation standings (`/scoreboard/[event]/organizations`): one row per
 * organisation, its score on each problem of every contest in the event, and
 * the entrants behind it on demand. Drawn with the hall board's classes, and
 * live on one subscription to `scoreboard/organizations.standings`.
 */
export function OrganizationStandings({
  eventKey,
  initial,
}: {
  eventKey: string;
  initial: OrganizationStandingsPayload;
}) {
  const t = useTranslations("contests.organizationStandings");
  const live = useQuery(api.scoreboard.organizations.standings, { key: eventKey });
  const payload = live === undefined ? initial : live;
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  if (!payload) {
    return (
      <div className="hall theme-dark">
        <div className="hall-body">
          <p className="hall-empty">{t("gone")}</p>
        </div>
      </div>
    );
  }

  const several = payload.contests.length > 1;
  const contestNumber = new Map(payload.contests.map((contest, index) => [contest.key, index + 1]));
  const contestName = new Map(payload.contests.map((contest) => [contest.key, contest.name]));

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);

      if (next.has(id)) next.delete(id);
      else next.add(id);

      return next;
    });
  }

  return (
    <div className="hall theme-dark">
      <header className="hall-head">
        <span className="hall-title">{payload.event.name}</span>
        <span className="hall-division">{t("heading")}</span>
        {payload.frozen ? (
          <span className="hall-frozen-chip">
            <Snowflake size={12} strokeWidth={2} aria-hidden />
            {t("frozenChip")}
          </span>
        ) : null}
        <span className="hall-spacer" />
        <span className="hall-org-decay" title={t("decayHint", { decay: payload.decay })}>
          {t("decay", { decay: payload.decay })}
        </span>
        <Button asChild variant="secondary" size="sm" icon={<LayoutGrid aria-hidden />}>
          <Link href={`/scoreboard/${eventKey}/`}>{t("hallBoard")}</Link>
        </Button>
      </header>

      {payload.frozen ? (
        <p className="hall-banner">
          <Snowflake size={14} strokeWidth={2} aria-hidden />
          {t("freezeBanner")}
        </p>
      ) : null}

      <div className="hall-body">
        <div className="hall-stage">
          <div className="hall-panel scroll-quiet" data-active="true">
            {payload.organizations.length === 0 ? (
              <p className="hall-empty">{t("empty")}</p>
            ) : (
              <table className="hall-table hall-orgs">
                <thead>
                  <tr>
                    <th className="hall-rank" scope="col">
                      #
                    </th>
                    <th className="hall-team" scope="col">
                      {t("columnOrganization")}
                    </th>
                    {payload.problems.map((problem, index) => (
                      <th
                        // biome-ignore lint/suspicious/noArrayIndexKey: the column order is the identity
                        key={index}
                        className="hall-prob"
                        scope="col"
                        title={t("problemTitle", {
                          contest: contestName.get(problem.contestKey) ?? problem.contestKey,
                          problem: problem.name || problem.label,
                        })}
                        data-contest-start={
                          several && payload.problems[index - 1]?.contestKey !== problem.contestKey
                            ? "true"
                            : undefined
                        }
                      >
                        {several
                          ? `${contestNumber.get(problem.contestKey) ?? ""}${problem.label}`
                          : problem.label}
                      </th>
                    ))}
                    <th className="hall-prob" scope="col">
                      {t("columnTotal")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {payload.organizations.map((organization) => {
                    const expanded = open.has(organization.id);

                    return (
                      <Fragment key={organization.id}>
                        <tr data-row={organization.id}>
                          <td className="hall-rank">{organization.rank}</td>
                          <td className="hall-team">
                            <button
                              type="button"
                              className="hall-org-toggle"
                              aria-expanded={expanded}
                              aria-label={
                                expanded
                                  ? t("hideEntrants", { name: organization.name })
                                  : t("showEntrants", { name: organization.name })
                              }
                              onClick={() => toggle(organization.id)}
                            >
                              <ChevronRight size={14} strokeWidth={2} aria-hidden />
                            </button>
                            <OrganizationLogo organization={organization} />
                            {organization.name}
                          </td>
                          {organization.problems.map((problem, index) => (
                            <td
                              // biome-ignore lint/suspicious/noArrayIndexKey: the column order is the identity
                              key={index}
                              className="hall-cell"
                              data-state={problem.score > 0 ? "solved" : "empty"}
                            >
                              <span className="hall-cell-value">
                                {problem.score > 0 ? formatScore(problem.score) : ""}
                              </span>
                            </td>
                          ))}
                          <td className="hall-org-total">{formatScore(organization.total)}</td>
                        </tr>
                        {expanded ? (
                          <tr className="hall-org-entrants">
                            <td />
                            <td colSpan={payload.problems.length + 2}>
                              {organization.entrants.length === 0 ? (
                                t("noEntrants")
                              ) : (
                                <ul>
                                  {organization.entrants.map((entrant) => (
                                    <li key={entrant.username}>
                                      <Link href={`/user/${entrant.username}`}>{entrant.displayName}</Link>
                                      <span className="hall-org-number">{formatScore(entrant.total)}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <footer className="hall-foot">
        {several
          ? payload.contests.map((contest, index) => (
              <span key={contest.key} className="hall-legend">
                <span className="hall-org-number">{index + 1}</span>
                {contest.name}
              </span>
            ))
          : null}
        <span className="hall-spacer" />
        <span>{t("organizations", { count: payload.organizations.length })}</span>
      </footer>
    </div>
  );
}
