"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  EmptyState,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@moj/ui";
import { Puzzle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useTransition } from "react";

export type SolvedGroup = {
  name: string;
  points: number;
  problems: { code: string; name: string; points: number; total: number }[];
};

function round(value: number) {
  return value.toLocaleString("en-AU", { maximumFractionDigits: 3 });
}

/**
 * `user/user-problems.html`'s solved list: one collapsible section per problem
 * group. The "Compare with me" switch is spec section 20's replacement for
 * DMOJ's `hide_solved` checkbox, and it keeps its state in the URL so the
 * comparison is a link you can send someone.
 */
export function SolvedProblems({
  username,
  groups,
  comparedWith,
  canCompare,
  compare,
}: {
  username: string;
  groups: SolvedGroup[];
  comparedWith: string | null;
  canCompare: boolean;
  compare: boolean;
}) {
  const router = useRouter();
  const toggleId = useId();
  const [pending, startTransition] = useTransition();

  const empty = groups.length === 0;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-h3 font-semibold text-foreground">Solved problems</h3>
        {canCompare ? (
          <Switch
            id={toggleId}
            label="Compare with me"
            checked={compare}
            disabled={pending}
            onCheckedChange={(next) => {
              startTransition(() => {
                router.replace(next ? `/user/${username}/solved/?compare=1` : `/user/${username}/solved/`);
              });
            }}
          />
        ) : null}
      </div>

      {compare && comparedWith ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Showing only problems {username} has solved that {comparedWith} has not.
        </p>
      ) : null}

      {empty ? (
        <EmptyState
          icon={<Puzzle aria-hidden />}
          title={compare ? "Nothing left to compare" : "No solved problems"}
          description={
            compare
              ? `You have already solved everything ${username} has.`
              : `${username} has not yet solved any problems.`
          }
        />
      ) : (
        <Accordion type="multiple" defaultValue={groups[0] ? [groups[0].name] : []}>
          {groups.map((group) => (
            <AccordionItem key={group.name} value={group.name}>
              <AccordionTrigger>
                <span className="flex w-full items-baseline justify-between gap-3 pr-2">
                  <span>{group.name}</span>
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {round(group.points)} points · {group.problems.length}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <Table dense className="group/table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Problem</TableHead>
                      <TableHead numeric>Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.problems.map((problem) => (
                      <TableRow key={problem.code}>
                        <TableCell>
                          <Link href={`/problem/${problem.code}/`} className="font-medium hover:text-link">
                            {problem.name}
                          </Link>
                          <span className="ml-2 font-mono text-sm text-muted-foreground">{problem.code}</span>
                        </TableCell>
                        <TableCell numeric>
                          <Link
                            href={`/problem/${problem.code}/submissions/${username}/`}
                            className="hover:text-link"
                          >
                            {round(problem.points)}
                            <span className="text-muted-foreground"> / {round(problem.total)}</span>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </section>
  );
}
