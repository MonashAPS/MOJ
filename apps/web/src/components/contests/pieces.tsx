import { Badge, cn, Tooltip } from "@moj/ui";
import { BarChart3, Check, CircleDashed, CircleSlash2, EyeOff, Lock, Users } from "lucide-react";
import Link from "next/link";
import { formatDateTime } from "@/lib/format";

export type ProblemState = "solved" | "partial" | "attempted" | "untouched";

type TagRef = { _id: string; name: string; color: string; description: string };
type OrganizationRef = { _id: string; name: string; slug: string; shortName: string };

/** DMOJ paints a tag chip in the tag's own colour and picks the ink by luma. */
export function tagInk(color: string): string {
  const hex = color.replace("#", "");
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((char) => char + char)
          .join("")
      : hex;
  if (full.length !== 6) return "#000000";
  const red = Number.parseInt(full.slice(0, 2), 16) / 255;
  const green = Number.parseInt(full.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(full.slice(4, 6), 16) / 255;
  if (!Number.isFinite(red + green + blue)) return "#000000";
  return 0.299 * red + 0.587 * green + 0.114 * blue > 0.5 ? "#000000" : "#ffffff";
}

export function ContestTagChip({ tag }: { tag: TagRef }) {
  return (
    <Link
      href={`/contests/tag/${tag.name}/`}
      title={tag.description || undefined}
      style={{ backgroundColor: tag.color, color: tagInk(tag.color) }}
      className="inline-flex h-[18px] items-center rounded-full px-2 font-mono text-xs font-medium"
    >
      {tag.name}
    </Link>
  );
}

/** `contest_head` in DMOJ's list.html: the chips that follow a contest's name. */
export function ContestChips({
  isVisible,
  isPrivate,
  isOrganizationPrivate,
  isRated,
  organizations,
  tags,
}: {
  isVisible: boolean;
  isPrivate: boolean;
  isOrganizationPrivate: boolean;
  isRated: boolean;
  organizations: OrganizationRef[];
  tags: TagRef[];
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 align-middle">
      {!isVisible ? (
        <Badge variant="neutral" shape="pill" mono>
          <EyeOff size={11} aria-hidden />
          hidden
        </Badge>
      ) : null}
      {isOrganizationPrivate ? (
        organizations.map((organization) => (
          <Badge key={organization._id} variant="outline" shape="pill" mono>
            <Lock size={11} aria-hidden />
            {organization.shortName || organization.name}
          </Badge>
        ))
      ) : isPrivate ? (
        <Badge variant="neutral" shape="pill" mono>
          <Lock size={11} aria-hidden />
          private
        </Badge>
      ) : null}
      {isRated ? (
        <Badge variant="warn" shape="pill" mono>
          <BarChart3 size={11} aria-hidden />
          rated
        </Badge>
      ) : null}
      {tags.map((tag) => (
        <ContestTagChip key={tag._id} tag={tag} />
      ))}
    </span>
  );
}

/** `timedelta('localized-no-seconds')`: "3 hours", "2 hours, 30 minutes", "1 day". */
export function humanDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const parts: string[] = [];
  const push = (value: number, unit: string) => {
    if (value > 0) parts.push(`${value} ${unit}${value === 1 ? "" : "s"}`);
  };
  push(days, "day");
  push(hours, "hour");
  push(minutes, "minute");
  if (parts.length === 0) return "under a minute";
  return parts.slice(0, 2).join(", ");
}

/** DMOJ's open-ended tutorial contests run to the year 9999; past this a length
 *  stops being information. */
export const OPEN_ENDED = 100 * 24 * 3600_000;

/** DMOJ's `time_left` block: the window on one line, its length on the next. */
export function ContestWindow({
  startTime,
  endTime,
  timeLimit,
  className,
}: {
  startTime: number;
  endTime: number;
  timeLimit: number | null;
  className?: string;
}) {
  return (
    <div className={cn("font-mono text-sm tabular-nums text-muted-foreground", className)}>
      <div>
        {timeLimit ? `${formatDateTime(startTime)} – ${formatDateTime(endTime)}` : formatDateTime(startTime)}
      </div>
      <div>
        {timeLimit
          ? `${humanDuration(timeLimit * 1000)} window`
          : endTime - startTime > OPEN_ENDED
            ? "Open-ended"
            : `${humanDuration(endTime - startTime)} long`}
      </div>
    </div>
  );
}

const STATE_ICON = {
  solved: { Icon: Check, className: "text-(--state-solved)", label: "Solved" },
  partial: { Icon: CircleSlash2, className: "text-(--state-partial)", label: "Partially solved" },
  attempted: { Icon: CircleDashed, className: "text-(--state-attempted)", label: "Attempted" },
  untouched: { Icon: CircleDashed, className: "text-transparent", label: "Not attempted" },
} as const;

/** Section 12.1's state column, so a contest problem reads like a list problem. */
export function ProblemStateIcon({ state, title }: { state: ProblemState; title?: string }) {
  const { Icon, className, label } = STATE_ICON[state];
  if (state === "untouched") return <span className="sr-only">{label}</span>;
  return (
    <Tooltip content={title ?? label}>
      <span className={cn("inline-flex items-center", className)}>
        <Icon size={14} aria-hidden />
        <span className="sr-only">{title ?? label}</span>
      </span>
    </Tooltip>
  );
}

/** DMOJ's user-count cell: a link to the ranking when the viewer may see it. */
export function UserCount({ count, href }: { count: number; href?: string | null }) {
  const body = (
    <span className="font-mono text-mono tabular-nums">
      <Users size={12} className="mr-1 inline text-muted-foreground" aria-hidden />
      {count}
    </span>
  );
  return href ? (
    <Link href={href} className="relative z-1">
      {body}
    </Link>
  ) : (
    body
  );
}
