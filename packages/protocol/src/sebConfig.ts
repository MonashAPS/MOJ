import { SEB_APPLICATIONS, SEB_OS_MACOS, SEB_OS_WINDOWS } from "./sebApps";

/**
 * Generating a Safe Exam Browser configuration, and the Config Key for it.
 *
 * MOJ knows everything the file needs — the contest's own address above all —
 * so making an organiser build one by hand and find somewhere to host it is
 * work nobody has to do. The file is generated, stored, and served by the site.
 *
 * The Config Key is the part to be careful with. SEB derives it from the
 * settings by a documented recipe, and an exam server is expected to arrive at
 * the same number independently. There is no published test vector for that
 * recipe, so the value this module computes is checked against the
 * specification and against itself, and not against a real client. Anything
 * that consumes it should let an operator override it with a key read off the
 * SEB Configuration Tool, which is the only source that is certainly right.
 */

/** The subset of a `.seb` file MOJ writes. Everything else takes SEB's default. */
export type SebConfigValue = string | number | boolean | SebConfigDict | SebConfigValue[];
export type SebConfigDict = { [key: string]: SebConfigValue };

export type SebConfigOptions = {
  /** Where SEB lands, normally the contest: `https://judge.example.org/contest/x/`. */
  startUrl: string;
  /** Where "quit" sends the browser. */
  quitUrl: string;
};

/**
 * A deliberately permissive configuration.
 *
 * It does not stop anyone switching to another application, does not filter
 * what they browse to, and does not kill processes. What it does is prove which
 * configuration is running and give SEB Server a session to capture. Locking
 * the machine down further is a different configuration and a different
 * decision, and an operator who wants one can upload their own.
 */
export function sebConfigFor(options: SebConfigOptions): SebConfigDict {
  return {
    // 0 = starting an exam. 1 would reconfigure the client instead, which is
    // not what a competitor should be handed.
    sebConfigPurpose: 0,
    startURL: options.startUrl,
    quitURL: options.quitUrl,

    // The whole point: without this SEB sends no hash and the judge cannot tell
    // it apart from any other browser. The salt keeps the requested URL inside
    // the hash, which is what the judge recomputes against.
    sendBrowserExamKey: true,
    browserURLSalt: true,

    // Permissive by intent.
    allowSwitchToApplications: true,
    monitorProcesses: false,
    URLFilterEnable: false,
    createNewDesktop: false,
    killExplorerShell: false,
    allowUserSwitching: true,
    allowWlan: true,
    allowQuit: true,

    // Reconfiguring SEB from inside the session would change the Config Key,
    // which is the one thing that has to stay shut.
    allowPreferencesWindow: false,

    // A judge shows verdicts as they arrive, so reloading has to work.
    browserWindowAllowReload: true,

    // 3 = the modern WKWebView everywhere. macOS deprecated the classic engine
    // and SEB shows a banner on it; nothing here uses SEB's JavaScript API,
    // which is the only reason to stay on the old one.
    browserWindowWebView: 3,

    // Without the dock a competitor has no way to start anything: macOS hides
    // its own, so the permitted applications below would be unreachable.
    showTaskBar: true,
    taskBarHeight: 40,
    permittedProcesses: permittedProcesses(),
  };
}

/**
 * One row per platform an application names.
 *
 * `active` puts it in the dock, `allowUser` lets the competitor start it, and
 * `autostart` is off so nothing launches itself into their face. `strongKill`
 * is off as well: SEB should not be taking an unsaved buffer away from anyone.
 */
function permittedProcesses(): SebConfigDict[] {
  const rows: SebConfigDict[] = [];
  for (const app of SEB_APPLICATIONS) {
    const common = {
      active: true,
      allowUser: true,
      autostart: false,
      iconInTaskbar: true,
      runInBackground: false,
      strongKill: false,
      title: app.title,
      description: app.title,
      arguments: [] as SebConfigValue[],
    };
    if (app.macBundleId) {
      rows.push({ ...common, os: SEB_OS_MACOS, identifier: app.macBundleId, executable: "" });
    }
    if (app.windowsExecutable) {
      rows.push({
        ...common,
        os: SEB_OS_WINDOWS,
        executable: app.windowsExecutable,
        originalName: app.windowsExecutable,
        identifier: "",
      });
    }
  }
  return rows;
}

/* -------------------------------------------------------------------------- */
/* The file                                                                   */
/* -------------------------------------------------------------------------- */

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function plistValue(value: SebConfigValue, depth: number): string {
  const pad = "\t".repeat(depth);
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (typeof value === "number") return `<integer>${value}</integer>`;
  if (typeof value === "string") return `<string>${escapeXml(value)}</string>`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "<array/>";
    return `<array>\n${value.map((item) => `${pad}\t${plistValue(item, depth + 1)}`).join("\n")}\n${pad}</array>`;
  }
  return plistDict(value, depth);
}

function plistDict(dict: SebConfigDict, depth: number): string {
  const pad = "\t".repeat(depth);
  if (Object.keys(dict).length === 0) return "<dict/>";
  const body = Object.keys(dict)
    .sort(compareKeys)
    .map(
      (key) =>
        `${pad}\t<key>${escapeXml(key)}</key>\n${pad}\t${plistValue(dict[key] as SebConfigValue, depth + 1)}`,
    )
    .join("\n");
  return `<dict>\n${body}\n${pad}</dict>`;
}

/** The unencrypted `.seb` form, which is an XML property list. */
export function sebConfigPlist(config: SebConfigDict): string {
  const body = Object.keys(config)
    .sort(compareKeys)
    .map((key) => `\t<key>${escapeXml(key)}</key>\n\t${plistValue(config[key] as SebConfigValue, 1)}`)
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    body,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

/* -------------------------------------------------------------------------- */
/* The Config Key                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Metadata rather than settings, and excluded from the Config Key by the
 * specification. MOJ never writes it, but a configuration that came from the
 * Configuration Tool will carry one.
 */
const EXCLUDED_FROM_CONFIG_KEY = new Set(["originatorVersion"]);

/**
 * Case-insensitive and culture-invariant, per the specification. It also warns
 * against two keys differing only in capitalisation, so ties fall back to the
 * ordinary comparison rather than being left to the sort's stability.
 */
function compareKeys(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The JSON the Config Key hashes: every dictionary ordered by key, no
 * whitespace, no added escaping.
 */
export function sebConfigKeyJson(config: SebConfigDict): string {
  return encodeDict(config);
}

function encodeValue(value: SebConfigValue): string {
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  // Array order is the author's and is preserved; only dictionaries sort.
  if (Array.isArray(value)) return `[${value.map(encodeValue).join(",")}]`;
  return encodeDict(value);
}

function encodeDict(dict: SebConfigDict): string {
  const parts: string[] = [];
  for (const key of Object.keys(dict).sort(compareKeys)) {
    if (EXCLUDED_FROM_CONFIG_KEY.has(key)) continue;
    parts.push(`${JSON.stringify(key)}:${encodeValue(dict[key] as SebConfigValue)}`);
  }
  return `{${parts.join(",")}}`;
}

/** Base16 SHA-256 of that JSON, which is what a contest stores as a Config Key. */
export async function sebConfigKey(config: SebConfigDict): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sebConfigKeyJson(config)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
