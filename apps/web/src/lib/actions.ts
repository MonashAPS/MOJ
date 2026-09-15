import { cookies, headers } from "next/headers";

/** Server actions report failure as a value; nothing here throws at the client. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export function failed(error: unknown): { ok: false; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message.replace(/^\[.*?\]\s*/, "") };
}

/**
 * Better Auth's server API answers with `Set-Cookie` headers; a server action
 * has to hand them to Next's cookie store itself, because the response the
 * browser sees is Next's, not Better Auth's.
 */
export async function applySetCookies(responseHeaders: Headers): Promise<void> {
  const store = await cookies();
  for (const raw of responseHeaders.getSetCookie()) {
    const [pair = "", ...attributes] = raw.split(";");
    const index = pair.indexOf("=");
    if (index < 0) continue;
    const name = pair.slice(0, index).trim();
    const value = decodeURIComponent(pair.slice(index + 1).trim());

    const options: {
      path?: string;
      maxAge?: number;
      expires?: Date;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      domain?: string;
    } = {};
    for (const attribute of attributes) {
      const [key = "", attributeValue = ""] = attribute.split("=").map((part) => part.trim());
      switch (key.toLowerCase()) {
        case "path":
          options.path = attributeValue;
          break;
        case "max-age":
          options.maxAge = Number(attributeValue);
          break;
        case "expires":
          options.expires = new Date(attributeValue);
          break;
        case "httponly":
          options.httpOnly = true;
          break;
        case "secure":
          options.secure = true;
          break;
        case "domain":
          options.domain = attributeValue;
          break;
        case "samesite":
          options.sameSite = attributeValue.toLowerCase() as "lax" | "strict" | "none";
          break;
      }
    }
    store.set(name, value, options);
  }
}

export async function authHeaders(): Promise<Headers> {
  return new Headers(await headers());
}
