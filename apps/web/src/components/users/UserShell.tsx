import { cn, MicroLabel, Panel, ratingClass, ratingTitle, type TabItem, TitleRow } from "@moj/ui";
import { Info, List, Puzzle, UserCog } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate } from "@/lib/format";

export type UserShellProfile = {
  username: string;
  displayName: string;
  displayRank: string;
  points: number;
  performancePoints: number;
  problemCount: number;
  rating?: number;
  isUnlisted: boolean;
  joinDate: number;
};

export type UserShellData = {
  profile: UserShellProfile;
  rank: number;
  ratingRank: number | null;
  contestsWritten: number;
  ratingStats: { current: number; min: number; max: number } | null;
  organizations: { slug: string; name: string; shortName: string }[];
};

const DASH = "—";

function whole(value: number) {
  return Math.round(value).toLocaleString("en-AU");
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <MicroLabel>{label}</MicroLabel>
      <span className="font-mono text-mono tabular-nums text-foreground">{children}</span>
    </div>
  );
}

function RatingValue({ rating }: { rating: number }) {
  return (
    <span className={cn("rating", ratingClass(rating))} title={ratingTitle(rating)}>
      {rating}
    </span>
  );
}

/** `user/user-base.html`: the profile sidebar and the tab bar every user page
 *  wears. DMOJ keeps the sidebar at the left of the user page, so MOJ does too. */
export function UserShell({
  data,
  gravatar,
  tab,
  isViewer,
  organizationLinks,
  children,
}: {
  data: UserShellData;
  gravatar: string;
  tab: "about" | "problems" | "submissions";
  isViewer: boolean;
  organizationLinks: Record<string, string>;
  children: ReactNode;
}) {
  const { profile } = data;
  const tabs: TabItem[] = [
    { key: "about", label: "About", href: `/user/${profile.username}/`, icon: <Info aria-hidden /> },
    {
      key: "problems",
      label: "Problems",
      href: `/user/${profile.username}/solved/`,
      icon: <Puzzle aria-hidden />,
    },
    {
      key: "submissions",
      label: "Submissions",
      href: `/user/${profile.username}/submissions/`,
      icon: <List aria-hidden />,
    },
  ];
  if (isViewer) {
    tabs.push({
      key: "edit",
      label: "Edit profile",
      href: "/edit/profile/",
      icon: <UserCog aria-hidden />,
    });
  }

  return (
    <>
      <TitleRow
        title={
          <span className={cn("rating", ratingClass(profile.rating), profile.displayRank === "admin" && "admin")}>
            {profile.displayName}
          </span>
        }
        tabs={tabs}
        active={tab}
      />
      <div
        id="content-body"
        className="grid gap-8 min-[960px]:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]"
      >
        <aside className="min-w-0">
          <div className="grid gap-4 min-[960px]:sticky min-[960px]:top-(--sticky-top)">
            <Panel title="Profile" bodyClassName="p-4">
              <div className="flex flex-col items-center gap-3">
                {/* biome-ignore lint/performance/noImgElement: gravatar is a remote host with no loader configured */}
                <img
                  src={gravatar}
                  alt=""
                  width={112}
                  height={112}
                  className={cn(
                    "size-28 rounded-full bg-secondary",
                    ratingClass(profile.rating) === "rate-target" && "ring-1 ring-[var(--rating-target)]",
                  )}
                />
                <p className="text-center font-mono text-mono tabular-nums text-foreground">
                  {profile.problemCount === 1 ? "1 problem solved" : `${profile.problemCount} problems solved`}
                </p>
              </div>

              <dl className="mt-4 divide-y divide-border border-t border-border pt-1">
                {profile.isUnlisted ? null : <Stat label="Rank by points">#{data.rank}</Stat>}
                <Stat label="Total points">
                  <span title={profile.performancePoints.toFixed(2)}>{whole(profile.performancePoints)}</span>
                </Stat>
                <Stat label="Problem points">{whole(profile.points)}</Stat>
                <Stat label="Contests written">{data.contestsWritten}</Stat>
                {data.ratingStats ? (
                  <>
                    {profile.isUnlisted || data.ratingRank === null ? null : (
                      <Stat label="Rank by rating">#{data.ratingRank}</Stat>
                    )}
                    <Stat label="Rating">
                      <RatingValue rating={data.ratingStats.current} />
                    </Stat>
                    <Stat label="Min. rating">
                      <RatingValue rating={data.ratingStats.min} />
                    </Stat>
                    <Stat label="Max rating">
                      <RatingValue rating={data.ratingStats.max} />
                    </Stat>
                  </>
                ) : (
                  <Stat label="Rating">
                    <span className="text-muted-foreground">{DASH}</span>
                  </Stat>
                )}
                <Stat label="Joined">{formatDate(profile.joinDate)}</Stat>
              </dl>

              {data.organizations.length > 0 ? (
                <div className="mt-3 border-t border-border pt-3">
                  <MicroLabel>Organizations</MicroLabel>
                  <ul className="mt-1 grid gap-1">
                    {data.organizations.map((organization) => (
                      <li key={organization.slug}>
                        <Link
                          href={organizationLinks[organization.slug] ?? `/organization/${organization.slug}`}
                          className="text-base text-link hover:underline"
                        >
                          {organization.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-3 border-t border-border pt-3">
                <Link
                  href={`/submissions/user/${profile.username}/`}
                  className="text-base text-link hover:underline"
                >
                  View submissions
                </Link>
              </div>
            </Panel>
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
