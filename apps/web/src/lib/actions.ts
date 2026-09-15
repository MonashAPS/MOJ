import { cookies, headers } from "next/headers";

/** Server actions report failure as a value; nothing here throws at the client. */
export type ActionFailure = { ok: false; error: string };

export type ActionResult<T = undefined> = { ok: true; data: T } | ActionFailure;

export function failed(cause: unknown): ActionFailure {
  const message = cause instanceof Error ? cause.message : String(cause);

  return { ok: false, error: message.replace(/^\[.*?\]\s*/, "") };
}

const SAME_SITE_POLICIES = ["lax", "strict", "none"] as const;

type SameSitePolicy = (typeof SAME_SITE_POLICIES)[number];

type CookieOptions = {
  path?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: SameSitePolicy;
  domain?: string;
};

/** The `SameSite` attribute Better Auth wrote, or undefined when it is not one Next accepts. */
function sameSitePolicy(value: string): SameSitePolicy | undefined {
  const lowered = value.toLowerCase();

  return SAME_SITE_POLICIES.find((policy) => policy === lowered);
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

    const options: CookieOptions = {};

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
        case "samesite": {
          const policy = sameSitePolicy(attributeValue);

          if (policy !== undefined) options.sameSite = policy;
          break;
        }
      }
    }

    store.set(name, value, options);
  }
}

export async function authHeaders(): Promise<Headers> {
  return new Headers(await headers());
}
