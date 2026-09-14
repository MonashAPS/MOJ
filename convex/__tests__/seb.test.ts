// @vitest-environment edge-runtime
/**
 * Locking a contest to Safe Exam Browser, end to end through Convex.
 *
 * The interesting cases are the ones where the lock should *not* bite — a
 * contest flagged but never configured, or a site that never turned the feature
 * on — because failing closed there would lock a contest nobody can enter, and
 * failing open silently is the thing the operator switched the flag on to stop.
 */

import { sebKeyHash } from "@moj/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertContest, insertContestProblem, insertParticipation } from "./contests.fixtures";
import { makeLanguage, makeProblem, makeProfile, setupTest, type T } from "./fixtures.helpers";

const SECRET = "test-seb-secret";
const CONFIG_KEY = "f".repeat(64);
const URL = "https://judge.example.org/problem/aplusb/submit/";

let previousSecret: string | undefined;
beforeAll(() => {
  previousSecret = process.env.SEB_TICKET_SECRET;
  process.env.SEB_TICKET_SECRET = SECRET;
});
afterAll(() => {
  if (previousSecret === undefined) delete process.env.SEB_TICKET_SECRET;
  else process.env.SEB_TICKET_SECRET = previousSecret;
});

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function fixture(options: { sebRequired?: boolean; sebEnabled?: boolean; keys?: boolean } = {}) {
  const t: T = setupTest();
  const languageId = await makeLanguage(t, "PY3");
  const problemId = await makeProblem(t, { code: "aplusb", allowedLanguageIds: [languageId] });
  const member = await makeProfile(t);

  const contestId = await t.run(async (ctx) =>
    insertContest(ctx.db, "mcpc", { sebRequired: options.sebRequired ?? true }),
  );
  await t.run(async (ctx) => insertContestProblem(ctx.db, contestId, problemId, 1));

  await t.run(async (ctx) => {
    await ctx.db.insert("siteSettings", {
      singleton: "site" as const,
      siteName: "MOJ",
      siteLongName: "MOJ",
      siteAdminEmail: "admin@example.com",
      registrationOpen: true,
      defaultUserTimezone: "Australia/Melbourne",
      defaultUserLanguageKey: "PY3",
      problemsPerPage: 50,
      commentsPerPage: 50,
      submissionsPerPage: 50,
      userRankingsPerPage: 100,
      blogPostsPerPage: 10,
      ratingRatios: [0.05, 0.15, 0.4, 0.7],
      requireStaffTwoFactor: false,
      pdfEnabled: false,
      sebEnabled: options.sebEnabled ?? true,
    });
    if (options.keys ?? true) {
      await ctx.db.insert("contestSebKeys", {
        contestId,
        configKeys: [CONFIG_KEY],
        browserExamKeys: [],
      });
    }
  });

  return { t, contestId, problemId, member, languageId };
}

/** Put the member in contest mode, the way joining would. */
async function enterContest(f: Fixture): Promise<Id<"contestParticipations">> {
  const participationId = await f.t.run(async (ctx) =>
    insertParticipation(ctx.db, f.contestId, f.member.profileId),
  );
  await f.t.run(async (ctx) => ctx.db.patch(f.member.profileId, { currentParticipationId: participationId }));
  return participationId;
}

/** The header a genuine SEB would have sent for this request. */
async function goodHash(url = URL): Promise<string> {
  return await sebKeyHash(url, CONFIG_KEY);
}

function submit(f: Fixture, sebTicket?: string) {
  return f.t.withIdentity({ subject: f.member.userId }).mutation(api.submissions.submit, {
    problemCode: "aplusb",
    languageKey: "PY3",
    source: "print(1)",
    sebTicket,
  });
}

describe("seb:ticket", () => {
  it("mints one for a request carrying the right hash", async () => {
    const f = await fixture();
    const { ticket } = await f.t.withIdentity({ subject: f.member.userId }).mutation(api.seb.ticket, {
      contestKey: "mcpc",
      url: URL,
      configKeyHash: await goodHash(),
    });
    expect(ticket).toMatch(/^v1\./);
  });

  it("mints nothing for a request with no header", async () => {
    const f = await fixture();
    const { ticket } = await f.t.withIdentity({ subject: f.member.userId }).mutation(api.seb.ticket, {
      contestKey: "mcpc",
      url: URL,
      configKeyHash: null,
    });
    expect(ticket).toBeNull();
  });

  it("mints nothing for a hash computed against another URL", async () => {
    const f = await fixture();
    const { ticket } = await f.t.withIdentity({ subject: f.member.userId }).mutation(api.seb.ticket, {
      contestKey: "mcpc",
      url: URL,
      configKeyHash: await goodHash("https://judge.example.org/somewhere/else/"),
    });
    expect(ticket).toBeNull();
  });

  it("mints nothing when the contest is not locked", async () => {
    const f = await fixture({ sebRequired: false });
    const { ticket } = await f.t.withIdentity({ subject: f.member.userId }).mutation(api.seb.ticket, {
      contestKey: "mcpc",
      url: URL,
      configKeyHash: await goodHash(),
    });
    expect(ticket).toBeNull();
  });
});

describe("submitting to a locked contest", () => {
  it("is refused without a ticket", async () => {
    const f = await fixture();
    await enterContest(f);
    await expect(submit(f)).rejects.toThrow(/Safe Exam Browser/);
  });

  it("goes through with one", async () => {
    const f = await fixture();
    await enterContest(f);
    const { ticket } = await f.t.withIdentity({ subject: f.member.userId }).mutation(api.seb.ticket, {
      contestKey: "mcpc",
      url: URL,
      configKeyHash: await goodHash(),
    });
    const created = await submit(f, ticket ?? undefined);
    expect(created.id).toBe(1);
  });

  it("is refused with somebody else's ticket", async () => {
    const f = await fixture();
    await enterContest(f);
    const other = await makeProfile(f.t);
    const { ticket } = await f.t.withIdentity({ subject: other.userId }).mutation(api.seb.ticket, {
      contestKey: "mcpc",
      url: URL,
      configKeyHash: await goodHash(),
    });
    expect(ticket).not.toBeNull();
    await expect(submit(f, ticket ?? undefined)).rejects.toThrow(/Safe Exam Browser/);
  });

  it("is refused with an invented ticket", async () => {
    const f = await fixture();
    await enterContest(f);
    await expect(submit(f, "v1.abc.def")).rejects.toThrow(/Safe Exam Browser/);
  });
});

describe("a lock that should not bite", () => {
  it("lets a flagged contest with no keys through, rather than locking everyone out", async () => {
    const f = await fixture({ keys: false });
    await enterContest(f);
    await expect(submit(f)).resolves.toMatchObject({ id: 1 });
  });

  it("lets a flagged contest through while the site setting is off", async () => {
    const f = await fixture({ sebEnabled: false });
    await enterContest(f);
    await expect(submit(f)).resolves.toMatchObject({ id: 1 });
  });

  it("leaves an unlocked contest alone", async () => {
    const f = await fixture({ sebRequired: false });
    await enterContest(f);
    await expect(submit(f)).resolves.toMatchObject({ id: 1 });
  });

  it("leaves submissions outside any contest alone", async () => {
    const f = await fixture();
    await expect(submit(f)).resolves.toMatchObject({ id: 1 });
  });
});

describe("joining a locked contest", () => {
  function join(f: Fixture, sebTicket?: string) {
    return f.t
      .withIdentity({ subject: f.member.userId })
      .mutation(api.contests.join, { key: "mcpc", sebTicket });
  }

  it("is refused without a ticket, because joining is what opens the problems", async () => {
    const f = await fixture();
    await expect(join(f)).rejects.toThrow(/Safe Exam Browser/);
  });

  it("goes through with one", async () => {
    const f = await fixture();
    const { ticket } = await f.t.withIdentity({ subject: f.member.userId }).mutation(api.seb.ticket, {
      contestKey: "mcpc",
      url: URL,
      configKeyHash: await goodHash(),
    });
    await expect(join(f, ticket ?? undefined)).resolves.toMatchObject({ virtual: 0 });
  });
});

describe("seb:requirement", () => {
  it("reports an unverified request while in a locked contest", async () => {
    const f = await fixture();
    await enterContest(f);
    const state = await f.t
      .withIdentity({ subject: f.member.userId })
      .query(api.seb.requirement, { url: URL, configKeyHash: null });
    expect(state).toMatchObject({ locked: true, verified: false, presented: false, contestKey: "mcpc" });
  });

  it("tells a wrong configuration apart from no SEB at all", async () => {
    const f = await fixture();
    await enterContest(f);
    const state = await f.t
      .withIdentity({ subject: f.member.userId })
      .query(api.seb.requirement, { url: URL, configKeyHash: "a".repeat(64) });
    expect(state).toMatchObject({ locked: true, verified: false, presented: true });
  });

  it("verifies a genuine one", async () => {
    const f = await fixture();
    await enterContest(f);
    const state = await f.t
      .withIdentity({ subject: f.member.userId })
      .query(api.seb.requirement, { url: URL, configKeyHash: await goodHash() });
    expect(state).toMatchObject({ locked: true, verified: true, presented: true });
  });

  it("says nothing is locked outside a contest", async () => {
    const f = await fixture();
    const state = await f.t
      .withIdentity({ subject: f.member.userId })
      .query(api.seb.requirement, { url: URL, configKeyHash: null });
    expect(state).toMatchObject({ locked: false });
  });
});
