/** DMOJ's `BAD_MAIL_PROVIDERS` and `BAD_MAIL_PROVIDER_REGEX`
 *  (judge/utils/mail.py). The built-in list is the throwaway-inbox services that
 *  turn up on a club sign-up form; a deployment adds its own through the
 *  environment rather than a code change. */

const BUILT_IN = [
  "0-mail.com",
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "anonbox.net",
  "byom.de",
  "dispostable.com",
  "e4ward.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamailblock.com",
  "inboxbear.com",
  "jetable.org",
  "mail-temporaire.fr",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "sharklasers.com",
  "spam4.me",
  "spambog.com",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempinbox.com",
  "tempmail.net",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "yopmail.com",
  "yopmail.fr",
];

const BUILT_IN_PATTERNS = [
  /^(?:.+\.)?mailinator\.com$/,
  /^(?:.+\.)?yopmail\.(?:com|fr|net)$/,
  /^(?:.+\.)?guerrillamail\.(?:com|net|org|biz|de|info)$/,
  /^(?:.+\.)?(?:temp|throwaway|trash|fake|disposable)mail\b.*$/,
  /^(?:.+\.)?10minutemail\..+$/,
];

function fromEnvironment(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function blockedDomains(): Set<string> {
  return new Set([...BUILT_IN, ...fromEnvironment("BAD_MAIL_PROVIDERS")]);
}

function blockedPatterns(): RegExp[] {
  const extra = fromEnvironment("BAD_MAIL_PROVIDER_REGEX").map((source) => new RegExp(source));
  return [...BUILT_IN_PATTERNS, ...extra];
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Your email provider is not allowed due to a history of abuse. Use a reputable email provider.";

/** True when the address belongs to a provider the site will not accept. */
export function isDisposableEmail(email: string): boolean {
  if (!email.includes("@")) return false;
  const domain = email.split("@").pop()?.toLowerCase().trim();
  if (!domain) return false;
  if (blockedDomains().has(domain)) return true;
  return blockedPatterns().some((pattern) => pattern.test(domain));
}
