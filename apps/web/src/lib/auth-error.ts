import { APIError } from "better-auth/api";

/**
 * Better Auth reports a refused endpoint call by throwing `APIError`, which
 * carries the HTTP status and the body it would have answered with. Anything
 * else that reaches a catch block is a fault, not an answer, so it has neither.
 */
export function authErrorStatus(cause: unknown): number | null {
  return cause instanceof APIError ? cause.statusCode : null;
}

export function authErrorMessage(cause: unknown): string | null {
  return cause instanceof APIError ? (cause.body?.message ?? null) : null;
}
