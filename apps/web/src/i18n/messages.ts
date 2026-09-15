import { DEFAULT_LANGUAGE } from "@/lib/language";

/**
 * The message catalogue, one file per area of the site.
 *
 * The split is by area rather than one file per locale because a single
 * catalogue for a site this size is unreviewable, and because it lets a
 * translation land one area at a time.
 */
export const NAMESPACES = [
  "common",
  "auth",
  "problems",
  "submissions",
  "contests",
  "users",
  "organizations",
  "blog",
  "status",
  "admin",
] as const;

type Namespace = (typeof NAMESPACES)[number];

/** A catalogue file is a tree of message strings under grouping keys. */
export type Messages = { [key: string]: Messages | string };

export function isMessages(catalogue: unknown): catalogue is Messages {
  if (typeof catalogue !== "object" || catalogue === null || Array.isArray(catalogue)) return false;

  for (const value of Object.values(catalogue)) {
    if (typeof value !== "string" && !isMessages(value)) return false;
  }

  return true;
}

function isGroup(value: Messages | string | undefined): value is Messages {
  return typeof value === "object" && value !== null;
}

/** English under a translation, key by key, so a catalogue that is behind shows
 *  English for what it is missing rather than a blank or a raw key. */
function fillGaps(base: Messages, over: Messages): Messages {
  const merged = new Map(Object.entries(base));

  for (const [key, value] of Object.entries(over)) {
    const existing = merged.get(key);

    if (isGroup(value) && isGroup(existing)) {
      merged.set(key, fillGaps(existing, value));
    } else if (value !== "") {
      merged.set(key, value);
    }
  }

  return Object.fromEntries(merged);
}

async function read(language: string, namespace: Namespace): Promise<Messages> {
  try {
    const loaded: unknown = (await import(`../../messages/${language}/${namespace}.json`)).default;

    return isMessages(loaded) ? loaded : {};
  } catch {
    // A namespace a translation has not reached yet.
    return {};
  }
}

export async function loadMessages(language: string): Promise<Messages> {
  const messages: Messages = {};

  for (const namespace of NAMESPACES) {
    const english = await read(DEFAULT_LANGUAGE, namespace);
    messages[namespace] =
      language === DEFAULT_LANGUAGE ? english : fillGaps(english, await read(language, namespace));
  }

  return messages;
}
