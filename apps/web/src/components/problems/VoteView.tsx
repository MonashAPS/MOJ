"use client";

import { api } from "@convex/_generated/api";
import { Alert, AlertTitle, Button, Field, Input, Panel, Textarea } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { formatPoints, plural } from "@/lib/units";

type Stats = NonNullable<(typeof api.problems.voteStats)["_returnType"]>;

/** DMOJ's vote-stats canvas, drawn as bars: one column per point value between
 *  the smallest and largest vote the site allows. */
function Histogram({ stats }: { stats: Stats }) {
  const counts = new Map<number, number>();
  for (const vote of stats.votes) counts.set(vote, (counts.get(vote) ?? 0) + 1);
  const max = Math.max(1, ...counts.values());
  const values: number[] = [];
  for (let value = stats.minPossibleVote; value <= stats.maxPossibleVote; value += 1) values.push(value);

  return (
    <div className="flex h-40 items-end gap-px" role="img" aria-label="Distribution of point votes">
      {values.map((value) => {
        const count = counts.get(value) ?? 0;
        return (
          <span
            key={value}
            title={`${value} points — ${plural(count, "vote")}`}
            className="min-w-[3px] flex-1 rounded-t-xs bg-primary"
            style={{ height: `${(count / max) * 100}%`, opacity: count === 0 ? 0.12 : 1 }}
          />
        );
      })}
    </div>
  );
}

export function VoteView({
  code,
  canVote,
  initialVote,
  currentPoints,
}: {
  code: string;
  canVote: boolean;
  initialVote: { points: number; note: string } | null;
  currentPoints: number;
}) {
  const stats = useQuery(api.problems.voteStats, { code });
  const castVote = useMutation(api.problems.vote);
  const deleteVote = useMutation(api.problems.deleteVote);

  const [points, setPoints] = useState(initialVote ? String(initialVote.points) : "");
  const [note, setNote] = useState(initialVote?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voted, setVoted] = useState(initialVote !== null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (thrown) {
      setError(
        thrown instanceof ConvexError && typeof thrown.data === "object" && thrown.data !== null
          ? String((thrown.data as { message?: string }).message ?? "Your vote was not saved.")
          : "Your vote was not saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  const min = stats?.minPossibleVote ?? 1;
  const max = stats?.maxPossibleVote ?? 50;

  return (
    <div className="grid gap-4">
      <Panel title="Voting statistics" bodyClassName="grid gap-3 p-3">
        {stats === undefined || stats === null ? (
          <p className="text-sm text-muted-foreground">Voting statistics are not available.</p>
        ) : stats.votes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No votes have been cast yet.</p>
        ) : (
          <>
            <Histogram stats={stats} />
            <dl className="grid gap-1 border-t border-border pt-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-subtle">Median vote</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {stats.median === null ? "—" : stats.median.toFixed(1)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-subtle">Mean vote</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {stats.mean === null ? "—" : stats.mean.toFixed(1)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-subtle">Number of votes</dt>
                <dd className="font-mono tabular-nums text-foreground">{stats.votes.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-subtle">Current points</dt>
                <dd className="font-mono tabular-nums text-foreground">
                  {formatPoints(stats.currentPoints)}
                </dd>
              </div>
            </dl>
          </>
        )}
      </Panel>

      {canVote ? (
        <form
          className="grid max-w-md gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(points);
            if (!Number.isFinite(value) || value < min || value > max) {
              setError(`Your vote must be between ${min} and ${max} points.`);
              return;
            }
            void run(async () => {
              await castVote({ code, points: Math.round(value), note: note || undefined });
              setVoted(true);
            });
          }}
        >
          <h2 className="font-display text-h2 font-bold tracking-tight text-foreground">
            {voted ? "Change vote" : "Cast vote"}
          </h2>

          {error ? (
            <Alert variant="danger" role="alert">
              <TriangleAlert size={16} aria-hidden />
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}

          <Field label="Points" htmlFor="vote-points" hint={`Between ${min} and ${max}.`}>
            <Input
              id="vote-points"
              type="number"
              step={1}
              min={min}
              max={max}
              mono
              required
              value={points}
              placeholder={formatPoints(currentPoints)}
              onChange={(event) => setPoints(event.target.value)}
            />
          </Field>

          <Field label="Justification" htmlFor="vote-note" optional>
            <Textarea
              id="vote-note"
              rows={8}
              value={note}
              placeholder="A short justification for your vote to this problem's point value."
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>

          <div className="flex gap-2">
            <Button type="submit" busy={busy}>
              Vote!
            </Button>
            {voted ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await deleteVote({ code });
                    setVoted(false);
                    setPoints("");
                    setNote("");
                  })
                }
              >
                Delete vote
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <p className="text-base text-muted-foreground">
          Solve this problem to vote on how many points it should be worth.
        </p>
      )}
    </div>
  );
}
