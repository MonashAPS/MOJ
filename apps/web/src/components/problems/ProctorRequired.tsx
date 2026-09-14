import { Button } from "@moj/ui";
import { MonitorPlay } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Enough shapes to read as a statement without being one. */
const LINES = [
  "w-[92%]",
  "w-[78%]",
  "w-[86%]",
  "w-[64%]",
  "w-[88%]",
  "w-[71%]",
  "w-[95%]",
  "w-[58%]",
  "w-[83%]",
  "w-[90%]",
  "w-[67%]",
  "w-[76%]",
];

/**
 * A problem you may not read yet.
 *
 * The page keeps its shape — a statement is obviously there and obviously
 * withheld — rather than pretending the problem does not exist. Blurred bars
 * stand in for the text; nothing real is sent to the browser, so there is
 * nothing to read out of the markup.
 */
export async function ProctorRequired({ contestName }: { contestName: string | null }) {
  const t = await getTranslations("contests.supervision");

  return (
    <div className="relative">
      <div
        aria-hidden
        className="select-none blur-[3px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      >
        <div className="mb-6 h-7 w-1/3 rounded bg-secondary" />
        <div className="grid gap-3">
          {LINES.map((width) => (
            <div key={width} className={`h-4 rounded bg-secondary ${width}`} />
          ))}
        </div>
      </div>

      <div className="absolute inset-0 flex items-start justify-center pt-16">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-lg">
          <MonitorPlay size={22} aria-hidden className="mx-auto text-muted-foreground" />
          <h2 className="mt-3 font-display text-h3 font-semibold tracking-tight">{t("title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {contestName ? t("body", { name: contestName }) : t("noticeProctor")}
          </p>
          <Button asChild className="mt-5">
            <Link href="/proctor/">{t("proctorAction")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
