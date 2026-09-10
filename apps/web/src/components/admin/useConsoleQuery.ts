"use client";

import { useConvex } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The console's read models live in `convex/pages/admin1.ts`, which is pushed
 * with the rest of the branch. Until that push happens the module is simply not
 * on the deployment, and `useQuery` would throw the missing-function error
 * straight through React. This runs the query as a promise instead, so a
 * missing module is a state (`unavailable`) the screen can fall back from
 * rather than a crash.
 *
 * Once `pages/admin1` is deployed, `unavailable` is always false and every
 * fallback branch in the console is dead code.
 */
export type ConsoleQueryResult<T> = {
  data: T | undefined;
  unavailable: boolean;
  error: string | null;
};

function isMissingFunction(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Could not find public function") ||
    message.includes("could not find function") ||
    message.includes("Server Error")
  );
}

export function useConsoleQuery<Q extends FunctionReference<"query">>(
  reference: Q,
  args: Q["_args"] | "skip",
): ConsoleQueryResult<Q["_returnType"]> {
  const convex = useConvex();
  const [state, setState] = useState<ConsoleQueryResult<Q["_returnType"]>>({
    data: undefined,
    unavailable: false,
    error: null,
  });
  const key = useMemo(() => (args === "skip" ? "skip" : JSON.stringify(args)), [args]);
  const latest = useRef(0);

  useEffect(() => {
    if (key === "skip") {
      setState({ data: undefined, unavailable: false, error: null });
      return;
    }
    const token = ++latest.current;
    let cancelled = false;
    convex
      .query(reference, args as Q["_args"])
      .then((data) => {
        if (cancelled || token !== latest.current) return;
        setState({ data, unavailable: false, error: null });
      })
      .catch((caught: unknown) => {
        if (cancelled || token !== latest.current) return;
        if (isMissingFunction(caught)) {
          setState({ data: undefined, unavailable: true, error: null });
          return;
        }
        setState({
          data: undefined,
          unavailable: false,
          error: caught instanceof Error ? caught.message : "That query failed.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [convex, reference, key, args]);

  return state;
}
