/**
 * The URL the Safe Exam Browser check is computed against.
 *
 * SEB hashes the URL it put on the wire, so the reconstruction has to match the
 * browser's view rather than the server's. Behind Caddy the app sees
 * `web:3000`, and a hash built from that matches nothing at all.
 */

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SEB_URL_HEADER, sebRequestUrl } from "@/lib/seb";
import { proxy } from "@/proxy";

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("sebRequestUrl", () => {
  it("prefers the proxy's view of the scheme and host", () => {
    const url = sebRequestUrl(
      headers({ host: "web:3000", "x-forwarded-proto": "https", "x-forwarded-host": "judge.example.org" }),
      new URL("http://web:3000/contest/mcpc/"),
    );
    expect(url).toBe("https://judge.example.org/contest/mcpc/");
  });

  it("falls back to the Host header when nothing was forwarded", () => {
    const url = sebRequestUrl(
      headers({ host: "localhost:3000" }),
      new URL("http://localhost:3000/problems/"),
    );
    expect(url).toBe("http://localhost:3000/problems/");
  });

  it("takes the first value of a forwarded header list", () => {
    const url = sebRequestUrl(
      headers({ "x-forwarded-proto": "https, http", "x-forwarded-host": "judge.example.org, inner" }),
      new URL("http://web:3000/"),
    );
    expect(url).toBe("https://judge.example.org/");
  });

  it("keeps the query string, which the hash covers", () => {
    const url = sebRequestUrl(
      headers({ host: "judge.example.org" }),
      new URL("https://judge.example.org/submissions/?page=2&user=me"),
    );
    expect(url).toBe("https://judge.example.org/submissions/?page=2&user=me");
  });

  it("keeps the trailing slash exactly as asked for", () => {
    const bare = sebRequestUrl(headers({ host: "h" }), new URL("https://h/contest/mcpc"));
    const slashed = sebRequestUrl(headers({ host: "h" }), new URL("https://h/contest/mcpc/"));
    expect(bare).not.toBe(slashed);
  });
});

describe("the proxy", () => {
  /** What the app would see, which is the request headers as the proxy left them. */
  async function forwarded(url: string, init: RequestInit = {}): Promise<Headers | null> {
    const response = await proxy(new NextRequest(new Request(url, init)));
    const override = response.headers.get("x-middleware-override-headers");
    if (!override) return null;
    const out = new Headers();
    for (const name of override.split(",").map((value) => value.trim())) {
      const value = response.headers.get(`x-middleware-request-${name}`);
      if (value !== null) out.set(name, value);
    }
    return out;
  }

  it("stamps the request's own URL on the way through", async () => {
    const seen = await forwarded("https://judge.example.org/problems/");
    expect(seen?.get(SEB_URL_HEADER)).toBe("https://judge.example.org/problems/");
  });

  it("stamps it on an exempt path too, since those render pages as well", async () => {
    const seen = await forwarded("https://judge.example.org/accounts/login/");
    expect(seen?.get(SEB_URL_HEADER)).toBe("https://judge.example.org/accounts/login/");
  });

  it("stamps the proxied host, not the internal one", async () => {
    const seen = await forwarded("http://web:3000/contest/mcpc/", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "judge.example.org" },
    });
    expect(seen?.get(SEB_URL_HEADER)).toBe("https://judge.example.org/contest/mcpc/");
  });

  it("redirects a slashless URL rather than stamping it", async () => {
    const response = await proxy(new NextRequest(new Request("https://judge.example.org/problems")));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://judge.example.org/problems/");
  });
});
