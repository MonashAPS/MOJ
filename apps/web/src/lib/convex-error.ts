import { ConvexError } from "convex/values";

type MojErrorData = { code?: string; message?: string };

type RateLimitData = { kind: "RateLimited"; retryAfter?: number };

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** A `ConvexError` payload is free-form JSON; these name the three the app throws. */
function isTextPayload(payload: unknown): payload is string {
  return typeof payload === "string";
}

function isRateLimitPayload(payload: unknown): payload is RateLimitData {
  return (
    typeof payload === "object" && payload !== null && "kind" in payload && payload.kind === "RateLimited"
  );
}

function isMessagePayload(payload: unknown): payload is MojErrorData & { message: string } {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message.length > 0
  );
}

/**
 * The message a mutation meant the member to read. `convex/lib/errors.ts` throws
 * `ConvexError({code, message})`; the rate limiter throws its own payload; anything
 * else is a bug and gets the fallback rather than a stack frame.
 */
export function mutationError(cause: unknown, fallback = "That did not work. Try again."): string {
  if (!(cause instanceof ConvexError)) return fallback;

  const payload: unknown = cause.data;

  if (isTextPayload(payload)) return payload;

  if (isRateLimitPayload(payload)) {
    const seconds = Math.max(1, Math.ceil((payload.retryAfter ?? 0) / 1000));

    return `You are doing that too often. Try again in ${plural(seconds, "second", "seconds")}.`;
  }

  if (isMessagePayload(payload)) return payload.message;

  return fallback;
}
