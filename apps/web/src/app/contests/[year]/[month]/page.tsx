import { api } from "@convex/_generated/api";
import { Button, TitleRow } from "@moj/ui";
import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { queryAsViewer } from "@/lib/convex-server";
import { contestListTabs } from "../../tabs";
import { CalendarGrid } from "./CalendarGrid";

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}): Promise<Metadata> {
  const { year, month } = await params;
  const t = await getTranslations("contests.calendar");
  const index = Number.parseInt(month, 10) - 1;
  const name = MONTHS[index];

  return { title: name ? t("metaTitle", { month: t(`months.${name}`), year }) : t("metaFallback") };
}

export default async function ContestCalendarPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  const t = await getTranslations("contests.calendar");
  const list = await getTranslations("contests.list");
  const tabLabels = await getTranslations("contests.tabs");
  const { year: yearParam, month: monthParam } = await params;
  const year = Number.parseInt(yearParam, 10);
  const month = Number.parseInt(monthParam, 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) notFound();

  const [calendar, permissions] = await Promise.all([
    queryAsViewer(api.contests.calendar, { year, month, offsetMinutes: 600 }).catch(() => null),
    queryAsViewer(api.viewer.permissions, {
      codes: ["judge.edit_all_contest", "judge.edit_own_contest"],
    }).catch(() => ({}) as Record<string, boolean>),
  ]);

  if (!calendar) notFound();

  const canEditContests =
    permissions["judge.edit_all_contest"] === true || permissions["judge.edit_own_contest"] === true;

  const now = new Date();

  return (
    <>
      <TitleRow
        title={t("title", { month: t(`months.${MONTHS[month - 1]}`), year: String(year) })}
        tabs={contestListTabs({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          canEdit: canEditContests,
          t: tabLabels,
        })}
        active="calendar"
        action={
          <Button asChild variant="secondary" size="sm" icon={<CalendarPlus aria-hidden />}>
            <a href="/contests.ics">{list("subscribe")}</a>
          </Button>
        }
      />
      <CalendarGrid calendar={calendar} />
    </>
  );
}
