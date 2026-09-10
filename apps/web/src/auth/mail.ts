export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type RememberedLink = { url: string; kind: string; at: number };

declare global {
  var __mojRecentLinks: Map<string, RememberedLink> | undefined;
}

/** Activation and reset links are kept in memory in dev so the
 *  registration-complete page can show them without a mail server. It hangs off
 *  globalThis because the route handler and the page render in different module
 *  graphs in dev, but the same process. */
globalThis.__mojRecentLinks ??= new Map<string, RememberedLink>();
const recentLinks: Map<string, RememberedLink> = globalThis.__mojRecentLinks;

export function rememberLink(email: string, kind: string, url: string) {
  recentLinks.set(email.toLowerCase(), { url, kind, at: Date.now() });
}

export function recallLink(email: string): RememberedLink | undefined {
  return recentLinks.get(email.toLowerCase());
}

export function mailMode(): "console" | "ses" {
  return process.env.MAIL_MODE === "ses" ? "ses" : "console";
}

export async function sendMail(mail: OutgoingMail): Promise<void> {
  if (mailMode() === "console") {
    console.info(
      [
        "",
        "──────────────── mail (MAIL_MODE=console) ────────────────",
        `to:      ${mail.to}`,
        `subject: ${mail.subject}`,
        "",
        mail.text,
        "──────────────────────────────────────────────────────────",
        "",
      ].join("\n"),
    );
    return;
  }

  const region = process.env.SES_REGION;
  const accessKeyId = process.env.SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "MAIL_MODE=ses but SES_REGION / SES_ACCESS_KEY_ID / SES_SECRET_ACCESS_KEY are not all set.",
    );
  }

  // TODO(mail): swap this for @aws-sdk/client-sesv2 once the dependency is
  // approved. Until then a misconfigured production deploy fails loudly rather
  // than silently dropping activation mail.
  throw new Error("SES transport is not wired up yet; set MAIL_MODE=console for now.");
}

export function activationEmail(username: string, url: string): OutgoingMail {
  return {
    to: "",
    subject: "Activate your MOJ account",
    text: [
      `Hi ${username},`,
      "",
      "Somebody, hopefully you, registered this address on the MAPS Online Judge.",
      "Follow the link below to activate the account. The link is good for seven days.",
      "",
      url,
      "",
      "If this was not you, ignore this message and the account will never be activated.",
    ].join("\n"),
  };
}

export function emailChangeActivationEmail(username: string, url: string): OutgoingMail {
  return {
    to: "",
    subject: "Email change request on MOJ",
    text: [
      `Hi ${username},`,
      "",
      "You asked to move your MAPS Online Judge account to this address.",
      "Follow the link below to confirm the change. The link is good for seven days.",
      "",
      url,
      "",
      "If you did not ask for this, ignore this message and nothing will change.",
    ].join("\n"),
  };
}

export function emailChangeNotifyEmail(username: string, newEmail: string): OutgoingMail {
  return {
    to: "",
    subject: "Alert: email change request on MOJ",
    text: [
      `Hi ${username},`,
      "",
      `Somebody, hopefully you, asked to change the address on your MAPS Online Judge`,
      `account to ${newEmail}.`,
      "",
      "If this was you, nothing more is needed here: confirm it from the new address.",
      "If this was not you, change your password straight away and open a ticket.",
    ].join("\n"),
  };
}

export function passwordResetEmail(username: string, url: string): OutgoingMail {
  return {
    to: "",
    subject: "Reset your MOJ password",
    text: [
      `Hi ${username},`,
      "",
      "Somebody asked to reset the password on your MAPS Online Judge account.",
      "Follow the link below to choose a new one. The link expires in an hour.",
      "",
      url,
      "",
      "If this was not you, nothing has changed and you can ignore this message.",
    ].join("\n"),
  };
}
