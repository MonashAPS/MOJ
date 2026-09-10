"use client";

import { api } from "@convex/_generated/api";
import type { ContestProblemEntry } from "@convex/contests";
import { Button, EmptyState, Panel, Select, Textarea, toast } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { MessageSquareWarning } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "@/lib/format";

/**
 * DMOJ shows a contest's clarifications as `ProblemClarification` rows on its
 * problems (judge/views/blog.py:49). Editors post from here rather than from
 * the admin, which is what the club asked for.
 */
export function Clarifications({
  contestKey,
  canPost,
  problems,
}: {
  contestKey: string;
  canPost: boolean;
  problems: ContestProblemEntry[];
}) {
  const rows = useQuery(api.contests.clarifications, { key: contestKey });
  const add = useMutation(api.contests.addClarification);
  const [problemCode, setProblemCode] = useState(problems[0]?.code ?? "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!body.trim()) {
      setError("A clarification needs a body.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await add({ key: contestKey, problemCode, description: body.trim() });
      setBody("");
      toast.success("Clarification posted");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The clarification could not be posted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="clarifications" className="mt-8 grid gap-3 scroll-mt-24">
      <Panel title="Clarifications" icon={<MessageSquareWarning size={14} aria-hidden />} bodyClassName="p-0">
        {rows === undefined ? null : rows === null || rows.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent"
            icon={<MessageSquareWarning aria-hidden />}
            title="No clarifications"
            description="Nothing has been clarified for this contest."
          />
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row._id} className="border-b border-border p-3 last:border-b-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-medium text-muted-foreground">{row.label}</span>
                  <span className="font-medium">{row.problemName}</span>
                  <span className="ml-auto font-mono text-sm tabular-nums text-muted-foreground">
                    {formatDateTime(row.date)}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-base">{row.description}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {canPost && problems.length > 0 ? (
        <Panel title="Post a clarification" bodyClassName="p-3">
          <form className="grid gap-3" onSubmit={submit}>
            <Select
              ariaLabel="Problem"
              value={problemCode}
              onValueChange={setProblemCode}
              options={problems.map((problem) => ({
                value: problem.code,
                label: `${problem.label}. ${problem.name}`,
              }))}
            />
            <Textarea
              rows={3}
              value={body}
              invalid={!!error}
              placeholder="What needs clarifying?"
              onChange={(event) => setBody(event.target.value)}
            />
            {error ? <p className="text-sm text-bad">{error}</p> : null}
            <div className="flex justify-end">
              <Button type="submit" busy={busy}>
                Post clarification
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}
    </section>
  );
}
