import { type AddressInfo, createServer } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  consoleTransport,
  createSesTransport,
  type MailEnvelope,
  mailFrom,
  mailMode,
  resetMailTransport,
  type SesClientFactory,
  type SesConfig,
  type SesSendInput,
  sendMail,
  sesConfigFromEnv,
  sesSendInput,
  setSesClientFactory,
  smtpConfigFromEnv,
  smtpTransportFrom,
  type Transporter,
} from "./mail";

const sesSend = vi.fn(async (_input: SesSendInput) => {});

const sesClientConfig = vi.fn((_config: SesConfig) => {});

/** The SES seam: `mail.ts` builds its client through this, so the SES path runs
 *  end to end without the AWS SDK or the network. */
const fakeSesClient: SesClientFactory = async (config) => {
  sesClientConfig(config);

  return { send: sesSend };
};

setSesClientFactory(fakeSesClient);

const ENV_KEYS = [
  "MAIL_MODE",
  "MAIL_FROM",
  "SES_REGION",
  "SES_ACCESS_KEY_ID",
  "SES_SECRET_ACCESS_KEY",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
] as const;

const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }

  resetMailTransport();
  vi.clearAllMocks();
});

function isNetworkAddress(address: AddressInfo | string | null): address is AddressInfo {
  return typeof address === "object" && address !== null;
}

/** A throwaway TCP port, so a test never collides with a real service. */
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (!isNetworkAddress(address)) throw new Error("the throwaway server bound to no port");

  return address.port;
}

describe("mode and sender", () => {
  test("console is the default and the fallback for anything unrecognised", () => {
    expect(mailMode({})).toBe("console");
    expect(mailMode({ MAIL_MODE: "postal-pigeon" })).toBe("console");
    expect(mailMode({ MAIL_MODE: " SES " })).toBe("ses");
    expect(mailMode({ MAIL_MODE: "smtp" })).toBe("smtp");
  });

  test("MAIL_FROM has a placeholder default", () => {
    expect(mailFrom({})).toBe("noreply@example.com");
    expect(mailFrom({ MAIL_FROM: " judge@example.org " })).toBe("judge@example.org");
  });

  test("the console transport prints the message rather than sending it", async () => {
    const lines: string[] = [];
    await consoleTransport((message) => lines.push(message)).send(
      { to: "someone@example.org", subject: "Hello", text: "Body text" },
      "judge@example.org",
    );
    expect(lines.join("\n")).toContain("someone@example.org");
    expect(lines.join("\n")).toContain("Body text");
  });

  test("sendMail with no MAIL_MODE reaches neither transport", async () => {
    delete process.env.MAIL_MODE;
    resetMailTransport();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendMail({ to: "someone@example.org", subject: "Hi", text: "Body" });
    expect(info).toHaveBeenCalled();
    expect(sesSend).not.toHaveBeenCalled();
    info.mockRestore();
  });
});

describe("SES", () => {
  test("the region is required and the credentials come in pairs", () => {
    expect(() => sesConfigFromEnv({})).toThrow(/SES_REGION/);
    // Neither key set: the SDK's own credential chain, for an instance role.
    expect(sesConfigFromEnv({ SES_REGION: "ap-southeast-2" })).toEqual({ region: "ap-southeast-2" });
    expect(() => sesConfigFromEnv({ SES_REGION: "ap-southeast-2", SES_ACCESS_KEY_ID: "AK" })).toThrow(
      /together/,
    );
    expect(
      sesConfigFromEnv({
        SES_REGION: "ap-southeast-2",
        SES_ACCESS_KEY_ID: "AK",
        SES_SECRET_ACCESS_KEY: "SK",
      }),
    ).toEqual({
      region: "ap-southeast-2",
      credentials: { accessKeyId: "AK", secretAccessKey: "SK" },
    });
  });

  test("the send input is SES's shape, with the HTML part only when there is one", () => {
    expect(sesSendInput({ to: "a@example.org", subject: "S", text: "T" }, "from@example.org")).toEqual({
      Source: "from@example.org",
      Destination: { ToAddresses: ["a@example.org"] },
      Message: {
        Subject: { Data: "S", Charset: "UTF-8" },
        Body: { Text: { Data: "T", Charset: "UTF-8" } },
      },
    });

    const withHtml = sesSendInput(
      { to: "a@example.org", subject: "S", text: "T", html: "<p>T</p>" },
      "from@example.org",
    );

    expect(withHtml.Message.Body).toHaveProperty("Html", { Data: "<p>T</p>", Charset: "UTF-8" });
  });

  test("the transport builds a client and sends the command", async () => {
    const transport = await createSesTransport({
      region: "ap-southeast-2",
      credentials: { accessKeyId: "AK", secretAccessKey: "SK" },
    });

    await transport.send({ to: "a@example.org", subject: "S", text: "T" }, "from@example.org");

    expect(sesClientConfig).toHaveBeenCalledWith({
      region: "ap-southeast-2",
      credentials: { accessKeyId: "AK", secretAccessKey: "SK" },
    });
    expect(sesSend).toHaveBeenCalledTimes(1);
    const input = sesSend.mock.calls[0]?.[0];

    if (!input) throw new Error("no SES command was sent");
    expect(input.Destination.ToAddresses).toEqual(["a@example.org"]);
    expect(input.Source).toBe("from@example.org");
  });

  test("MAIL_MODE=ses routes sendMail through the SES client", async () => {
    process.env.MAIL_MODE = "ses";
    process.env.MAIL_FROM = "judge@example.org";
    process.env.SES_REGION = "ap-southeast-2";
    process.env.SES_ACCESS_KEY_ID = "AK";
    process.env.SES_SECRET_ACCESS_KEY = "SK";
    resetMailTransport();

    await sendMail({ to: "someone@example.org", subject: "Activate", text: "link" });

    expect(sesSend).toHaveBeenCalledTimes(1);
    const input = sesSend.mock.calls[0]?.[0];

    if (!input) throw new Error("no SES command was sent");
    expect(input.Source).toBe("judge@example.org");
    expect(input.Message.Subject.Data).toBe("Activate");
  });

  test("MAIL_MODE=ses without a region fails loudly, and recovers once it is set", async () => {
    process.env.MAIL_MODE = "ses";
    delete process.env.SES_REGION;
    resetMailTransport();

    await expect(sendMail({ to: "a@example.org", subject: "S", text: "T" })).rejects.toThrow(/SES_REGION/);

    process.env.SES_REGION = "ap-southeast-2";
    await expect(sendMail({ to: "a@example.org", subject: "S", text: "T" })).resolves.toBeUndefined();
  });
});

describe("SMTP", () => {
  test("the host is required, the port defaults to 587 and 465 implies TLS", () => {
    expect(() => smtpConfigFromEnv({})).toThrow(/SMTP_HOST/);
    expect(smtpConfigFromEnv({ SMTP_HOST: "mail.example.org" })).toEqual({
      host: "mail.example.org",
      port: 587,
      secure: false,
    });
    expect(smtpConfigFromEnv({ SMTP_HOST: "mail.example.org", SMTP_PORT: "465" })).toEqual({
      host: "mail.example.org",
      port: 465,
      secure: true,
    });
    expect(
      smtpConfigFromEnv({ SMTP_HOST: "mail.example.org", SMTP_PORT: "465", SMTP_SECURE: "false" }),
    ).toEqual({ host: "mail.example.org", port: 465, secure: false });
    expect(() => smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_PORT: "no" })).toThrow(/port number/);
    expect(() => smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_USER: "u" })).toThrow(/together/);
    expect(smtpConfigFromEnv({ SMTP_HOST: "h", SMTP_USER: "u", SMTP_PASSWORD: "p" })).toHaveProperty("auth", {
      user: "u",
      pass: "p",
    });
  });

  test("the transport hands a complete message to nodemailer", async () => {
    const nodemailer = await import("nodemailer");
    // The stream transport is nodemailer's own local fake: it builds the real
    // MIME message and hands it back instead of opening a connection.
    const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const envelopes: MailEnvelope[] = [];
    const built: string[] = [];

    const recording: Transporter = {
      async sendMail(message) {
        envelopes.push(message);
        const info = await transporter.sendMail(message);

        if (Buffer.isBuffer(info.message)) built.push(info.message.toString("utf8"));

        return info;
      },
    };

    await smtpTransportFrom(recording).send(
      { to: "someone@example.org", subject: "Reset your password", text: "link" },
      "judge@example.org",
    );

    expect(envelopes).toEqual([
      {
        from: "judge@example.org",
        to: "someone@example.org",
        subject: "Reset your password",
        text: "link",
      },
    ]);
    const raw = built.join("");
    expect(raw).toContain("From: judge@example.org");
    expect(raw).toContain("To: someone@example.org");
    expect(raw).toContain("Subject: Reset your password");
  });

  test("MAIL_MODE=smtp delivers to a real SMTP listener", async () => {
    const port = await freePort();
    const { SMTPServer } = await import("smtp-server");

    const received: { from: string; to: string[]; body: string }[] = [];

    const server = new SMTPServer({
      authOptional: false,
      disabledCommands: ["STARTTLS"],
      onAuth(auth, _session, callback) {
        if (auth.username === "judge" && auth.password === "hunter2") callback(null, { user: "judge" });
        else callback(new Error("bad credentials"));
      },
      onData(stream, session, callback) {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", () => {
          received.push({
            from: session.envelope.mailFrom ? session.envelope.mailFrom.address : "",
            to: session.envelope.rcptTo.map((rcpt) => rcpt.address),
            body: Buffer.concat(chunks).toString("utf8"),
          });
          callback();
        });
      },
    });

    await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));

    try {
      process.env.MAIL_MODE = "smtp";
      process.env.MAIL_FROM = "judge@example.org";
      process.env.SMTP_HOST = "127.0.0.1";
      process.env.SMTP_PORT = String(port);
      process.env.SMTP_USER = "judge";
      process.env.SMTP_PASSWORD = "hunter2";
      resetMailTransport();

      await sendMail({
        to: "someone@example.org",
        subject: "Activate your MOJ account",
        text: "https://judge.example.org/accounts/activate/token/",
      });

      expect(received).toHaveLength(1);
      expect(received[0]?.from).toBe("judge@example.org");
      expect(received[0]?.to).toEqual(["someone@example.org"]);
      expect(received[0]?.body).toContain("Subject: Activate your MOJ account");
      expect(received[0]?.body).toContain("https://judge.example.org/accounts/activate/token/");
      expect(sesSend).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 20_000);
});
