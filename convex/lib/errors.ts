import { ConvexError } from "convex/values";

export type MojErrorCode =
  | "UNAUTHENTICATED"
  | "NO_PROFILE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID"
  | "RATE_LIMITED";

export function mojError(
  code: MojErrorCode,
  message: string,
): ConvexError<{
  code: MojErrorCode;
  message: string;
}> {
  return new ConvexError({ code, message });
}

export function notFound(what: string) {
  return mojError("NOT_FOUND", `${what} not found`);
}

export function forbidden(message = "You do not have permission to do that.") {
  return mojError("FORBIDDEN", message);
}

export function invalid(message: string) {
  return mojError("INVALID", message);
}

/** The payload `mojError` attaches to a `ConvexError`. */
export type ErrorPayload = {
  code: string;
  message: string;
};

function isErrorPayload(value: unknown): value is ErrorPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "message" in value &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

/** The `mojError` payload a caught error carries, or null for anything else. */
export function errorPayload(cause: unknown): ErrorPayload | null {
  if (!(cause instanceof ConvexError)) return null;

  return isErrorPayload(cause.data) ? cause.data : null;
}
