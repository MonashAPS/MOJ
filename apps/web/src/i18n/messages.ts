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

export type Namespace = (typeof NAMESPACES)[number];

type Messages = Record<string, unknown>;

/** English under a translation, key by key, so a catalogue that is behind shows
 *  English for what it is missing rather than a blank or a raw key. */
function fillGaps(base: Messages, over: Messages): Messages {
  const merged: Messages = { ...base };

  for (const [key, value] of Object.entries(over)) {
    const existing = merged[key];

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      merged[key] = fillGaps(existing as Messages, value as Messages);
    } else if (value !== undefined && value !== "") {
      merged[key] = value;
    }
  }

  return merged;
}

async function read(language: string, namespace: Namespace): Promise<Messages> {
  try {
    return (await import(`../../messages/${language}/${namespace}.json`)).default as Messages;
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
