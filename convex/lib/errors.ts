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
