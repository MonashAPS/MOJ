/**
 * A request or response body is whatever the other side sent, so a caller
 * decodes one before it reads a field. `null` covers both a body that is not
 * JSON at all and a JSON value the caller does not recognise.
 */
export async function readJsonBody<Value>(
  source: Body,
  isValue: (value: unknown) => value is Value,
): Promise<Value | null> {
  try {
    const value: unknown = await source.json();

    return isValue(value) ? value : null;
  } catch {
    return null;
  }
}

/** The site's own routes report a refusal as `{error: {message}}`. */
type ErrorEnvelope = { error: { message?: string } };

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const { error } = value;

  return (
    typeof error === "object" &&
    error !== null &&
    (!("message" in error) || typeof error.message === "string")
  );
}

export async function readErrorMessage(response: Response): Promise<string | null> {
  const body = await readJsonBody(response, isErrorEnvelope);

  return body?.error.message ?? null;
}
