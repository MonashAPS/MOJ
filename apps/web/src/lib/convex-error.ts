import { ConvexError } from "convex/values";

type MojErrorData = { code?: string; message?: string };

type RateLimitData = { kind?: string; retryAfter?: number };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The message a mutation meant the member to read. `convex/lib/errors.ts` throws
 * `ConvexError({code, message})`; the rate limiter throws its own shape; anything
 * else is a bug and gets the fallback rather than a stack frame.
 */
export function mutationError(error: unknown, fallback = "That did not work. Try again."): string {
  if (error instanceof ConvexError) {
    const data = error.data as MojErrorData & RateLimitData;

    if (typeof data === "string") return data;

    if (data?.kind === "RateLimited") {
      const seconds = Math.max(1, Math.ceil((data.retryAfter ?? 0) / 1000));

      return `You are doing that too often. Try again in ${plural(seconds, "second", "seconds")}.`;
    }

    if (typeof data?.message === "string" && data.message.length > 0) return data.message;
  }

  return fallback;
}
