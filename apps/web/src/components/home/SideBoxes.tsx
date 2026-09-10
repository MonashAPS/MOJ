"use client";

import { api } from "@convex/_generated/api";
import { InfoBox, RatingName } from "@moj/ui";
import { useQuery } from "convex/react";
import Link from "next/link";
import { formatDuration, useCountdown } from "@/lib/countdown";
import { formatDate, formatRelative } from "@/lib/format";

export function ContestsBox() {
  const contests = useQuery(api.contests.homeSidebar, { limit: 5 });
  if (!contests || contests.length === 0) return null;
  return (
    <InfoBox title="Contests">
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {contests.map((contest) => (
          <ContestRow key={contest._id} contest={contest} />
        ))}
      </ul>
    </InfoBox>
  );
}

function ContestRow({
  contest,
}: {
  contest: { _id: string; key: string; name: string; startTime: number; endTime: number; state: string };
}) {
  const target = contest.state === "ongoing" ? contest.endTime : contest.startTime;
  const remaining = useCountdown(target);
  return (
    <li style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
      <Link href={`/contest/${contest.key}`}>{contest.name}</Link>
      <div style={{ color: "var(--muted)", fontSize: "0.9em", fontVariantNumeric: "tabular-nums" }}>
        {contest.state === "ongoing" ? "ends in " : "starts in "}
        {remaining === null ? "-" : formatDuration(remaining)}
      </div>
    </li>
  );
}

export function RecentCommentsBox() {
  const comments = useQuery(api.comments.recent, { limit: 5 });
  if (!comments || comments.length === 0) return null;
  return (
    <InfoBox title="Recent comments">
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {comments.map((comment) => (
          <li key={comment._id} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
            <Link href={comment.href}>{comment.targetTitle}</Link>
            <div style={{ color: "var(--muted)", fontSize: "0.9em" }}>
              <RatingName username={comment.author} rating={comment.authorRating} />{" "}
              {formatRelative(comment.time)}
            </div>
          </li>
        ))}
      </ul>
    </InfoBox>
  );
}

export function NewProblemsBox() {
  const problems = useQuery(api.problems.recent, { limit: 7 });
  if (!problems || problems.length === 0) return null;
  return (
    <InfoBox title="New problems">
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {problems.map((problem) => (
          <li
            key={problem._id}
            style={{
              display: "flex",
              gap: 8,
              padding: "4px 0",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <Link href={`/problem/${problem.code}`} style={{ flex: 1, minWidth: 0 }}>
              {problem.name}
            </Link>
            <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {problem.points}p
            </span>
          </li>
        ))}
      </ul>
    </InfoBox>
  );
}

export function TopUsersBox() {
  const users = useQuery(api.rankings.topUsers, { limit: 10 });
  if (!users || users.length === 0) return null;
  return (
    <InfoBox title="Top users">
      <ol style={{ margin: 0, paddingLeft: "1.4em" }}>
        {users.map((user) => (
          <li key={user._id} style={{ padding: "2px 0" }}>
            <RatingName
              username={user.username}
              rating={user.rating}
              href={`/user/${user.username}`}
              isAdmin={user.displayRank === "admin"}
            />{" "}
            <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {user.performancePoints.toFixed(0)}
            </span>
          </li>
        ))}
      </ol>
      <p style={{ margin: "6px 0 0" }}>
        <Link href="/users/">Full ranking</Link>
      </p>
    </InfoBox>
  );
}

export { formatDate };
