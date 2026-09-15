// @vitest-environment edge-runtime

import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  asUser,
  insertProfile,
  languageRow,
  problemRow,
  profileRow,
  siteSettingsRow,
  submissionRow,
} from "./test.fixtures";
import { setupTest } from "./test.setup";

async function seed() {
  const t = setupTest();

  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("siteSettings", siteSettingsRow());
    const languageId = await ctx.db.insert("languages", languageRow());
    const groupId = await ctx.db.insert("problemGroups", { name: "misc", fullName: "Misc" });

    const setter = await ctx.db.insert(
      "profiles",
      profileRow({ username: "setter", permissions: ["judge.edit_own_problem"] }),
    );

    const reporter = await ctx.db.insert("profiles", profileRow({ username: "reporter" }));
    const bystander = await ctx.db.insert("profiles", profileRow({ username: "bystander" }));

    const admin = await ctx.db.insert(
      "profiles",
      profileRow({ username: "ticketadmin", permissions: ["judge.change_ticket"] }),
    );

    const problemId = await ctx.db.insert(
      "problems",
      problemRow({ code: "alpha", groupId, authorProfileIds: [setter] }),
    );

    for (const profileId of [reporter, bystander]) {
      await ctx.db.insert(
        "submissions",
        submissionRow({
          profileId,
          problemId,
          languageId,
          result: "AC",
          points: 100,
          casePoints: 100,
          caseTotal: 100,
          priority: 0,
        }),
      );
    }

    return { setter, reporter, bystander, admin, problemId };
  });

  return { t, ids };
}

describe("creating tickets", () => {
  test("a user with no solves cannot open a ticket", async () => {
    const { t } = await seed();
    await insertProfile(t, { username: "fresh" });
    await expect(
      asUser(t, "fresh").mutation(api.tickets.create, {
        title: "Broken",
        body: "It is broken.",
      }),
    ).rejects.toThrow(/at least one problem/);
  });

  test("a problem ticket auto-assigns the problem's authors", async () => {
    const { t, ids } = await seed();

    const id = await asUser(t, "reporter").mutation(api.tickets.create, {
      title: "Statement typo",
      body: "The bound is wrong.",
      problemCode: "alpha",
    });

    const ticket = await asUser(t, "reporter").query(api.tickets.get, { id });
    expect(ticket?.assignees.map((entry) => entry.username)).toEqual(["setter"]);
    expect(ticket?.linkedHref).toBe("/problem/alpha");
    expect(ticket?.messages.map((message) => message.body)).toEqual(["The bound is wrong."]);
    expect(ids.setter).toBeTruthy();
  });

  test("a generic ticket has no assignees", async () => {
    const { t } = await seed();

    const id = await asUser(t, "reporter").mutation(api.tickets.create, {
      title: "Account question",
      body: "How do I change my name?",
    });

    const ticket = await asUser(t, "reporter").query(api.tickets.get, { id });
    expect(ticket?.assignees).toEqual([]);
    expect(ticket?.linkedType).toBeUndefined();
  });

  test("a muted user cannot open a ticket", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.reporter, { mute: true });
    });
    await expect(
      asUser(t, "reporter").mutation(api.tickets.create, {
        title: "Nope",
        body: "Nope.",
      }),
    ).rejects.toThrow(/silent, little toad/);
  });
});

describe("ticket visibility", () => {
  async function withTicket() {
    const { t, ids } = await seed();

    const ticketId = await asUser(t, "reporter").mutation(api.tickets.create, {
      title: "Statement typo",
      body: "The bound is wrong.",
      problemCode: "alpha",
    });

    return { t, ids, ticketId };
  }

  test("the author sees their own ticket", async () => {
    const { t, ticketId } = await withTicket();
    const ticket = await asUser(t, "reporter").query(api.tickets.get, { id: ticketId });
    expect(ticket?.title).toBe("Statement typo");
  });

  test("an assignee who edits the problem sees it", async () => {
    const { t, ticketId } = await withTicket();
    const ticket = await asUser(t, "setter").query(api.tickets.get, { id: ticketId });
    expect(ticket?.canEditNotes).toBe(true);
  });

  test("an unrelated user sees nothing", async () => {
    const { t, ticketId } = await withTicket();
    expect(await asUser(t, "bystander").query(api.tickets.get, { id: ticketId })).toBeNull();
    const list = await asUser(t, "bystander").query(api.tickets.list, {});
    expect(list.page).toHaveLength(0);
  });

  test("an anonymous visitor sees nothing", async () => {
    const { t, ticketId } = await withTicket();
    expect(await t.query(api.tickets.get, { id: ticketId })).toBeNull();
    expect((await t.query(api.tickets.list, {})).page).toHaveLength(0);
  });

  test("judge.change_ticket sees every ticket", async () => {
    const { t, ticketId } = await withTicket();
    const list = await asUser(t, "ticketadmin").query(api.tickets.list, {});
    expect(list.page.map((row) => row._id)).toEqual([ticketId]);
  });

  test("the open filter drops closed tickets", async () => {
    const { t, ticketId } = await withTicket();
    const admin = asUser(t, "ticketadmin");
    await admin.mutation(api.tickets.setOpen, { ticketId, open: false });

    expect((await admin.query(api.tickets.list, { onlyOpen: true })).page).toHaveLength(0);
    expect((await admin.query(api.tickets.list, {})).page).toHaveLength(1);
  });
});

describe("ticket workflow", () => {
  test("replies append to the thread in order", async () => {
    const { t } = await seed();

    const ticketId = await asUser(t, "reporter").mutation(api.tickets.create, {
      title: "Typo",
      body: "First",
      problemCode: "alpha",
    });

    await asUser(t, "setter").mutation(api.tickets.reply, { ticketId, body: "Second" });

    const ticket = await asUser(t, "setter").query(api.tickets.get, { id: ticketId });
    expect(ticket?.messages.map((message) => message.body)).toEqual(["First", "Second"]);
    expect(ticket?.messages[1]?.author?.username).toBe("setter");
  });

  test("notes are staff-only", async () => {
    const { t } = await seed();

    const ticketId = await asUser(t, "reporter").mutation(api.tickets.create, {
      title: "Typo",
      body: "First",
      problemCode: "alpha",
    });

    await expect(
      asUser(t, "reporter").mutation(api.tickets.setNotes, {
        ticketId,
        notes: "sneaky",
      }),
    ).rejects.toThrow();

    await asUser(t, "setter").mutation(api.tickets.setNotes, {
      ticketId,
      notes: "Confirmed with the setter.",
    });
    const ticket = await asUser(t, "setter").query(api.tickets.get, { id: ticketId });
    expect(ticket?.notes).toBe("Confirmed with the setter.");
  });

  test("assignment needs judge.change_ticket", async () => {
    const { t, ids } = await seed();

    const ticketId = await asUser(t, "reporter").mutation(api.tickets.create, {
      title: "Typo",
      body: "First",
      problemCode: "alpha",
    });

    await expect(
      asUser(t, "setter").mutation(api.tickets.assign, {
        ticketId,
        profileIds: [ids.bystander],
      }),
    ).rejects.toThrow();

    await asUser(t, "ticketadmin").mutation(api.tickets.assign, {
      ticketId,
      profileIds: [ids.bystander],
    });
    const ticket = await asUser(t, "bystander").query(api.tickets.get, { id: ticketId });
    expect(ticket?.assignees.map((entry) => entry.username)).toEqual(["bystander"]);
  });
});
