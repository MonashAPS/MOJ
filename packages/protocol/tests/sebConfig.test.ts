/**
 * The generated configuration and its Config Key.
 *
 * SEB publishes no (configuration, Config Key) pair, so none of this is checked
 * against a real client. What it can check is that the serialisation obeys the
 * rules the specification does state — ordering, whitespace, exclusions — and
 * that the key moves when the settings move and holds still when they do not.
 */

import { describe, expect, it } from "vitest";
import {
  type SebConfigDict,
  sebConfigFor,
  sebConfigKey,
  sebConfigKeyJson,
  sebConfigPlist,
} from "../src/sebConfig";

const OPTIONS = {
  startUrl: "https://judge.example.org/contest/mcpc/",
  quitUrl: "https://judge.example.org/contests/",
};

describe("sebConfigFor", () => {
  it("points SEB at the contest and asks it to send the key header", () => {
    const config = sebConfigFor(OPTIONS);
    expect(config.startURL).toBe("https://judge.example.org/contest/mcpc/");
    expect(config.sendBrowserExamKey).toBe(true);
    // Off, the hash would not cover the URL and no check could ever match.
    expect(config.browserURLSalt).toBe(true);
    // Reconfiguring from inside would change the Config Key.
    expect(config.allowPreferencesWindow).toBe(false);
  });

  it("stays permissive, which is the point of this configuration", () => {
    const config = sebConfigFor(OPTIONS);
    expect(config.allowSwitchToApplications).toBe(true);
    expect(config.monitorProcesses).toBe(false);
    expect(config.URLFilterEnable).toBe(false);
  });
});

describe("sebConfigKeyJson", () => {
  it("orders keys case-insensitively", () => {
    const json = sebConfigKeyJson({ zebra: 1, Apple: 2, banana: 3 });
    expect(json).toBe('{"Apple":2,"banana":3,"zebra":1}');
  });

  it("adds no whitespace", () => {
    expect(sebConfigKeyJson({ a: 1, b: "x" })).toBe('{"a":1,"b":"x"}');
  });

  it("writes booleans and numbers unquoted", () => {
    expect(sebConfigKeyJson({ on: true, off: false, n: 0 })).toBe('{"n":0,"off":false,"on":true}');
  });

  it("drops originatorVersion, which the specification excludes", () => {
    expect(sebConfigKeyJson({ originatorVersion: "SEB_Win_3.5.0", a: 1 })).toBe('{"a":1}');
  });

  it("escapes what JSON must escape and nothing more", () => {
    // A forward slash is not escaped: the specification says not to add
    // character escaping, and a URL is mostly slashes.
    const json = sebConfigKeyJson({ startURL: "https://judge.example.org/contest/x/" });
    expect(json).toBe('{"startURL":"https://judge.example.org/contest/x/"}');
    expect(sebConfigKeyJson({ q: 'a"b' })).toBe('{"q":"a\\"b"}');
  });

  it("does not depend on the order the object was built in", () => {
    const one: SebConfigDict = { b: 1, a: 2 };
    const two: SebConfigDict = { a: 2, b: 1 };
    expect(sebConfigKeyJson(one)).toBe(sebConfigKeyJson(two));
  });
});

describe("sebConfigKey", () => {
  it("is 64 hexadecimal characters, the shape a contest stores", async () => {
    expect(await sebConfigKey(sebConfigFor(OPTIONS))).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same settings", async () => {
    expect(await sebConfigKey(sebConfigFor(OPTIONS))).toBe(await sebConfigKey(sebConfigFor(OPTIONS)));
  });

  it("changes when any setting changes, including the contest it points at", async () => {
    const mine = await sebConfigKey(sebConfigFor(OPTIONS));
    const other = await sebConfigKey(
      sebConfigFor({ ...OPTIONS, startUrl: "https://judge.example.org/contest/other/" }),
    );
    expect(other).not.toBe(mine);
  });

  it("ignores originatorVersion, so the tool that wrote the file cannot move it", async () => {
    const bare = sebConfigFor(OPTIONS);
    const stamped = { ...bare, originatorVersion: "SEB_Win_3.5.0" };
    expect(await sebConfigKey(stamped)).toBe(await sebConfigKey(bare));
  });
});

describe("sebConfigPlist", () => {
  it("is a property list SEB can open", () => {
    const xml = sebConfigPlist(sebConfigFor(OPTIONS));
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain("<!DOCTYPE plist PUBLIC");
    expect(xml).toContain("<key>startURL</key>");
    expect(xml).toContain("<string>https://judge.example.org/contest/mcpc/</string>");
    expect(xml).toContain("<key>sendBrowserExamKey</key>\n\t<true/>");
    expect(xml).toContain("<key>monitorProcesses</key>\n\t<false/>");
    expect(xml).toContain("<key>sebConfigPurpose</key>\n\t<integer>0</integer>");
    expect(xml.trimEnd().endsWith("</plist>")).toBe(true);
  });

  it("escapes a URL that carries an ampersand", () => {
    const xml = sebConfigPlist({ startURL: "https://judge.example.org/?a=1&b=2" });
    expect(xml).toContain("<string>https://judge.example.org/?a=1&amp;b=2</string>");
  });
});
