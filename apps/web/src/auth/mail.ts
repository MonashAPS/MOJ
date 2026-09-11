export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailMode = "console" | "ses" | "smtp";

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

type Env = Record<string, string | undefined>;

export function mailMode(env: Env = process.env): MailMode {
  const mode = (env.MAIL_MODE ?? "console").trim().toLowerCase();
  if (mode === "ses" || mode === "smtp") return mode;
  return "console";
}

export function mailFrom(env: Env = process.env): string {
  return env.MAIL_FROM?.trim() || "noreply@example.com";
}

/* -------------------------------------------------------------------------- */
/* Transports                                                                 */
/* -------------------------------------------------------------------------- */

export type SesConfig = {
  region: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
};

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
};

export function sesConfigFromEnv(env: Env = process.env): SesConfig {
  const region = env.SES_REGION?.trim();
  if (!region) throw new Error("MAIL_MODE=ses needs SES_REGION.");
  const accessKeyId = env.SES_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.SES_SECRET_ACCESS_KEY?.trim();
  if (accessKeyId && secretAccessKey) return { region, credentials: { accessKeyId, secretAccessKey } };
  if (accessKeyId || secretAccessKey) {
    throw new Error("SES_ACCESS_KEY_ID and SES_SECRET_ACCESS_KEY have to be set together.");
  }
  // Neither set: leave the SDK to its own credential chain, which is how an
  // instance role or a mounted profile is meant to be used.
  return { region };
}

export function smtpConfigFromEnv(env: Env = process.env): SmtpConfig {
  const host = env.SMTP_HOST?.trim();
  if (!host) throw new Error("MAIL_MODE=smtp needs SMTP_HOST.");
  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`SMTP_PORT is not a port number: ${env.SMTP_PORT}`);
  }
  // Implicit TLS is port 465's convention; everything else starts in the clear
  // and upgrades with STARTTLS, which is what nodemailer does when `secure` is
  // false. `SMTP_SECURE` overrides it for a server that disagrees.
  const secureRaw = env.SMTP_SECURE?.trim().toLowerCase();
  const secure = secureRaw ? secureRaw === "1" || secureRaw === "true" : port === 465;
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASSWORD?.trim();
  if (user && pass) return { host, port, secure, auth: { user, pass } };
  if (user || pass) throw new Error("SMTP_USER and SMTP_PASSWORD have to be set together.");
  return { host, port, secure };
}

/** What a mail is on the wire, for either transport. */
export function mailEnvelope(mail: OutgoingMail, from: string) {
  return {
    from,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    ...(mail.html ? { html: mail.html } : {}),
  };
}

export function sesSendInput(mail: OutgoingMail, from: string) {
  return {
    Source: from,
    Destination: { ToAddresses: [mail.to] },
    Message: {
      Subject: { Data: mail.subject, Charset: "UTF-8" },
      Body: {
        Text: { Data: mail.text, Charset: "UTF-8" },
        ...(mail.html ? { Html: { Data: mail.html, Charset: "UTF-8" } } : {}),
      },
    },
  };
}

export interface MailTransport {
  send(mail: OutgoingMail, from: string): Promise<void>;
}

export function consoleTransport(log: (message: string) => void = console.info): MailTransport {
  return {
    async send(mail, from) {
      log(
        [
          "",
          "──────────────── mail (MAIL_MODE=console) ────────────────",
          `from:    ${from}`,
          `to:      ${mail.to}`,
          `subject: ${mail.subject}`,
          "",
          mail.text,
          "──────────────────────────────────────────────────────────",
          "",
        ].join("\n"),
      );
    },
  };
}

export async function createSesTransport(config: SesConfig): Promise<MailTransport> {
  const { SESClient, SendEmailCommand } = await import("@aws-sdk/client-ses");
  const client = new SESClient(config);
  return {
    async send(mail, from) {
      await client.send(new SendEmailCommand(sesSendInput(mail, from)));
    },
  };
}

export interface Transporter {
  sendMail(message: ReturnType<typeof mailEnvelope>): Promise<unknown>;
}

/** Split out so a test can drive a nodemailer transport it made itself. */
export function smtpTransportFrom(transporter: Transporter): MailTransport {
  return {
    async send(mail, from) {
      await transporter.sendMail(mailEnvelope(mail, from));
    },
  };
}

export async function createSmtpTransport(config: SmtpConfig): Promise<MailTransport> {
  const nodemailer = await import("nodemailer");
  return smtpTransportFrom(nodemailer.createTransport(config) as Transporter);
}

let transportPromise: Promise<MailTransport> | null = null;
let transportMode: MailMode | null = null;

/** Tests, and anything that changes MAIL_MODE at run time, need the cached
 *  transport dropped. */
export function resetMailTransport(): void {
  transportPromise = null;
  transportMode = null;
}

function buildTransport(mode: MailMode): Promise<MailTransport> {
  if (mode === "ses") return createSesTransport(sesConfigFromEnv());
  if (mode === "smtp") return createSmtpTransport(smtpConfigFromEnv());
  return Promise.resolve(consoleTransport());
}

export function mailTransport(): Promise<MailTransport> {
  const mode = mailMode();
  if (!transportPromise || transportMode !== mode) {
    transportMode = mode;
    transportPromise = buildTransport(mode).catch((error) => {
      // A transport that could not be built has to be rebuilt on the next send,
      // or one bad configuration poisons the process for its whole life.
      resetMailTransport();
      throw error;
    });
  }
  return transportPromise;
}

/** The single way anything in this app sends mail: every Better Auth callback
 *  goes through here, so the transport is chosen in exactly one place. */
export async function sendMail(mail: OutgoingMail): Promise<void> {
  const transport = await mailTransport();
  await transport.send(mail, mailFrom());
}

/* -------------------------------------------------------------------------- */
/* Templates                                                                  */
/* -------------------------------------------------------------------------- */

export function activationEmail(username: string, url: string): OutgoingMail {
  return {
    to: "",
    subject: "Activate your MOJ account",
    text: [
      `Hi ${username},`,
      "",
      "Somebody, hopefully you, registered this address on this judge.",
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
      "You asked to move your account on this judge to this address.",
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
      "Somebody, hopefully you, asked to change the address on your account to",
      `${newEmail}.`,
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
      "Somebody asked to reset the password on your account on this judge.",
      "Follow the link below to choose a new one. The link expires in an hour.",
      "",
      url,
      "",
      "If this was not you, nothing has changed and you can ignore this message.",
    ].join("\n"),
  };
}

/** Turning a second factor on or off is the first change an account takeover
 *  makes, so it is worth telling the owner about. */
export function twoFactorNoticeEmail(username: string, action: "enabled" | "disabled"): OutgoingMail {
  return {
    to: "",
    subject: `Two factor authentication ${action} on your MOJ account`,
    text: [
      `Hi ${username},`,
      "",
      `Two factor authentication was just ${action} on your account on this judge.`,
      "",
      "If this was you, there is nothing to do.",
      "If it was not, change your password straight away and open a ticket.",
    ].join("\n"),
  };
}
