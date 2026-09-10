import { api } from "@convex/_generated/api";
import { Button, TitleRow } from "@moj/ui";
import { CalendarPlus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";
import { contestListTabs } from "../../tabs";
import { CalendarGrid } from "./CalendarGrid";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}): Promise<Metadata> {
  const { year, month } = await params;
  const index = Number.parseInt(month, 10) - 1;
  const name = MONTHS[index];
  return { title: name ? `Contests in ${name} ${year}` : "Contest calendar" };
}

export default async function ContestCalendarPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
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
        title={`${MONTHS[month - 1]} ${year}`}
        tabs={contestListTabs({
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          canEdit: canEditContests,
        })}
        active="calendar"
        action={
          <Button asChild variant="secondary" size="sm" icon={<CalendarPlus aria-hidden />}>
            <a href="/contests.ics">Subscribe</a>
          </Button>
        }
      />
      <CalendarGrid calendar={calendar} />
    </>
  );
}
