import { afterEach, describe, expect, it } from "vitest";
import { appUrl, convexSiteUrl, convexUrl, publicConfig, publicOrigin } from "./public-config.server";

const NAMES = ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CONVEX_SITE_URL", "NEXT_PUBLIC_APP_URL"];

const saved = new Map(NAMES.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("publicOrigin", () => {
  it("reads the value the process was started with", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://judge.example.org";

    expect(publicOrigin("NEXT_PUBLIC_APP_URL")).toBe("https://judge.example.org");
  });

  it("drops trailing slashes so a path can be appended", () => {
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "https://judge.example.org/convex//";

    expect(publicOrigin("NEXT_PUBLIC_CONVEX_SITE_URL")).toBe("https://judge.example.org/convex");
  });

  it("treats unset and empty alike", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(publicOrigin("NEXT_PUBLIC_APP_URL")).toBeUndefined();

    process.env.NEXT_PUBLIC_APP_URL = "";
    expect(publicOrigin("NEXT_PUBLIC_APP_URL")).toBeUndefined();
  });
});

describe("publicConfig", () => {
  it("carries the three origins a deployment names", () => {
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://convex.judge.example.org";
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "https://convex-site.judge.example.org";
    process.env.NEXT_PUBLIC_APP_URL = "https://judge.example.org";

    expect(publicConfig()).toEqual({
      convexUrl: "https://convex.judge.example.org",
      convexSiteUrl: "https://convex-site.judge.example.org",
      appUrl: "https://judge.example.org",
    });
  });

  it("falls back to the local stack", () => {
    for (const name of NAMES) delete process.env[name];

    expect(convexUrl()).toBe("http://127.0.0.1:3210");
    expect(convexSiteUrl()).toBe("http://127.0.0.1:3211");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});
