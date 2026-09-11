// @vitest-environment edge-runtime

/**
 * Organisations and classes.
 *
 * The join rules are DMOJ's `JoinOrganization.handle` plus the access code and
 * slot checks the fork added, and the request review flow is
 * `OrganizationRequestView.post`.
 */

import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { setupConvexTest } from "./convexTest.setup";
import { makeOrganization, makeProfile } from "./fixtures.setup";

describe("organizations.join", () => {
  test("an open organisation accepts a member and counts them", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "keen");
      await makeOrganization(ctx, "maps", { name: "MAPS", isOpen: true });
    });

    await t.withIdentity({ subject: "user_keen" }).mutation(api.organizations.join, {
      slug: "maps",
    });

    const detail = await t
      .withIdentity({ subject: "user_keen" })
      .query(api.organizations.get, { slug: "maps" });
    expect(detail?.memberCount).toBe(1);
    expect(detail?.viewer.isMember).toBe(true);
    expect(detail?.viewer.canJoin).toBe(false);
    expect(detail?.viewer.canLeave).toBe(true);
  });

  test("a closed organisation refuses a direct join", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "keen");
      await makeOrganization(ctx, "closed", { isOpen: false });
    });

    await expect(
      t.withIdentity({ subject: "user_keen" }).mutation(api.organizations.join, {
        slug: "closed",
      }),
    ).rejects.toThrow(/not open/);
  });

  test("joining twice is refused", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "keen");
      await makeOrganization(ctx, "maps");
    });

    const asKeen = t.withIdentity({ subject: "user_keen" });
    await asKeen.mutation(api.organizations.join, { slug: "maps" });
    await expect(asKeen.mutation(api.organizations.join, { slug: "maps" })).rejects.toThrow(
      /already in the organization/,
    );
  });

  test("the fourth open organisation is refused", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "collector");
      for (const slug of ["a", "b", "c", "d"]) await makeOrganization(ctx, slug);
    });

    const asCollector = t.withIdentity({ subject: "user_collector" });
    for (const slug of ["a", "b", "c"]) {
      await asCollector.mutation(api.organizations.join, { slug });
    }
    await expect(asCollector.mutation(api.organizations.join, { slug: "d" })).rejects.toThrow(
      /more than 3 public organizations/,
    );
  });

  test("an access code is required when one is set", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "student");
      await makeOrganization(ctx, "class-of-26", { accessCode: "SECRET" });
    });

    const asStudent = t.withIdentity({ subject: "user_student" });
    await expect(asStudent.mutation(api.organizations.join, { slug: "class-of-26" })).rejects.toThrow(
      /access code/,
    );
    await expect(
      asStudent.mutation(api.organizations.join, { slug: "class-of-26", accessCode: "nope" }),
    ).rejects.toThrow(/access code/);

    await asStudent.mutation(api.organizations.join, {
      slug: "class-of-26",
      accessCode: "SECRET",
    });
    const detail = await asStudent.query(api.organizations.get, { slug: "class-of-26" });
    expect(detail?.viewer.isMember).toBe(true);
  });

  test("a full organisation refuses another member", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const first = await makeProfile(ctx, "early");
      await makeProfile(ctx, "late");
      const organizationId = await makeOrganization(ctx, "tiny", { slots: 1 });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        profileId: first,
        order: 0,
      });
      await ctx.db.patch(organizationId, { memberCount: 1 });
    });

    await expect(
      t.withIdentity({ subject: "user_late" }).mutation(api.organizations.join, { slug: "tiny" }),
    ).rejects.toThrow(/full/);
  });

  test("an anonymous visitor cannot join", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeOrganization(ctx, "maps");
    });
    await expect(t.mutation(api.organizations.join, { slug: "maps" })).rejects.toThrow(/logged in/);
  });
});

describe("organizations.leave and kick", () => {
  test("leaving removes the membership and the class membership", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "quitter");
      const organizationId = await makeOrganization(ctx, "maps");
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        profileId,
        order: 0,
      });
      await ctx.db.patch(organizationId, { memberCount: 1 });
      await ctx.db.insert("classes", {
        organizationId,
        name: "Beginners",
        slug: "beginners",
        isActive: true,
        adminProfileIds: [],
        memberProfileIds: [profileId],
      });
    });

    await t.withIdentity({ subject: "user_quitter" }).mutation(api.organizations.leave, {
      slug: "maps",
    });

    const detail = await t.query(api.organizations.get, { slug: "maps" });
    expect(detail?.memberCount).toBe(0);
    const members = await t.query(api.classes.members, {
      organizationSlug: "maps",
      classSlug: "beginners",
    });
    expect(members).toHaveLength(0);
  });

  test("leaving an organisation you are not in is refused", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "stranger");
      await makeOrganization(ctx, "maps", { shortName: "MAPS" });
    });

    await expect(
      t.withIdentity({ subject: "user_stranger" }).mutation(api.organizations.leave, {
        slug: "maps",
      }),
    ).rejects.toThrow(/not in \\"MAPS\\"/);
  });

  test("only an admin may kick", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const admin = await makeProfile(ctx, "admin");
      const member = await makeProfile(ctx, "member");
      const organizationId = await makeOrganization(ctx, "maps", {
        adminProfileIds: [admin],
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        profileId: member,
        order: 0,
      });
      await ctx.db.patch(organizationId, { memberCount: 1 });
    });

    await expect(
      t.withIdentity({ subject: "user_member" }).mutation(api.organizations.kick, {
        slug: "maps",
        username: "member",
      }),
    ).rejects.toThrow(/not allowed to kick/);

    await t.withIdentity({ subject: "user_admin" }).mutation(api.organizations.kick, {
      slug: "maps",
      username: "member",
    });
    const detail = await t.query(api.organizations.get, { slug: "maps" });
    expect(detail?.memberCount).toBe(0);
  });
});

describe("organizations join requests", () => {
  async function seed() {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const admin = await makeProfile(ctx, "admin");
      await makeProfile(ctx, "hopeful");
      const organizationId = await makeOrganization(ctx, "private", {
        name: "Private",
        isOpen: false,
        adminProfileIds: [admin],
      });
      await ctx.db.insert("classes", {
        organizationId,
        name: "Tutorial 1",
        slug: "tut1",
        isActive: true,
        adminProfileIds: [],
        memberProfileIds: [],
      });
    });
    return t;
  }

  test("a request lands as pending and cannot be doubled up", async () => {
    const t = await seed();
    const asHopeful = t.withIdentity({ subject: "user_hopeful" });

    await asHopeful.mutation(api.organizations.request, {
      slug: "private",
      reason: "I would like to join",
    });
    await expect(
      asHopeful.mutation(api.organizations.request, { slug: "private", reason: "again" }),
    ).rejects.toThrow(/already have a pending request/);

    const pending = await t
      .withIdentity({ subject: "user_admin" })
      .query(api.organizations.reviewRequests, { slug: "private" });
    expect(pending.requests.map((row) => row.username)).toEqual(["hopeful"]);
    expect(pending.editAll).toBe(true);
  });

  test("an open organisation has no request page", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "hopeful");
      await makeOrganization(ctx, "open");
    });

    await expect(
      t.withIdentity({ subject: "user_hopeful" }).mutation(api.organizations.request, {
        slug: "open",
        reason: "hello",
      }),
    ).rejects.toThrow(/not found/);
  });

  test("a class is required when the organisation says so", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      await makeProfile(ctx, "hopeful");
      await makeOrganization(ctx, "strict", { isOpen: false, classRequired: true });
    });

    await expect(
      t.withIdentity({ subject: "user_hopeful" }).mutation(api.organizations.request, {
        slug: "strict",
        reason: "hello",
      }),
    ).rejects.toThrow(/requires a class/);
  });

  test("approving adds the member and the class", async () => {
    const t = await seed();
    const requestId = (await t.withIdentity({ subject: "user_hopeful" }).mutation(api.organizations.request, {
      slug: "private",
      reason: "please",
      classSlug: "tut1",
    })) as Id<"organizationRequests">;

    await t.withIdentity({ subject: "user_admin" }).mutation(api.organizations.approve, { requestId });

    const detail = await t.query(api.organizations.get, { slug: "private" });
    expect(detail?.memberCount).toBe(1);
    const members = await t.query(api.classes.members, {
      organizationSlug: "private",
      classSlug: "tut1",
    });
    expect(members.map((row) => row.username)).toEqual(["hopeful"]);

    const log = await t
      .withIdentity({ subject: "user_admin" })
      .query(api.organizations.reviewRequests, { slug: "private", tab: "log" });
    expect(log.requests.map((row) => row.state)).toEqual(["A"]);
  });

  test("rejecting leaves the organisation untouched", async () => {
    const t = await seed();
    const requestId = (await t.withIdentity({ subject: "user_hopeful" }).mutation(api.organizations.request, {
      slug: "private",
      reason: "please",
    })) as Id<"organizationRequests">;

    await t.withIdentity({ subject: "user_admin" }).mutation(api.organizations.reject, { requestId });

    const detail = await t.query(api.organizations.get, { slug: "private" });
    expect(detail?.memberCount).toBe(0);
    const rejected = await t
      .withIdentity({ subject: "user_admin" })
      .query(api.organizations.reviewRequests, { slug: "private", tab: "rejected" });
    expect(rejected.requests).toHaveLength(1);
  });

  test("a stranger cannot review requests", async () => {
    const t = await seed();
    await t.withIdentity({ subject: "user_hopeful" }).mutation(api.organizations.request, {
      slug: "private",
      reason: "please",
    });
    await expect(
      t
        .withIdentity({ subject: "user_hopeful" })
        .query(api.organizations.reviewRequests, { slug: "private" }),
    ).rejects.toThrow(/permission/);
  });

  test("a class admin only sees their own class's requests", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const orgAdmin = await makeProfile(ctx, "orgadmin");
      const classAdmin = await makeProfile(ctx, "tutor");
      const one = await makeProfile(ctx, "mine");
      const two = await makeProfile(ctx, "theirs");
      const organizationId = await makeOrganization(ctx, "school", {
        isOpen: false,
        adminProfileIds: [orgAdmin],
      });
      const mineClass = await ctx.db.insert("classes", {
        organizationId,
        name: "Mine",
        slug: "mine",
        isActive: true,
        adminProfileIds: [classAdmin],
        memberProfileIds: [],
      });
      const otherClass = await ctx.db.insert("classes", {
        organizationId,
        name: "Other",
        slug: "other",
        isActive: true,
        adminProfileIds: [],
        memberProfileIds: [],
      });
      await ctx.db.insert("organizationRequests", {
        profileId: one,
        organizationId,
        classId: mineClass,
        time: 1,
        state: "P",
        reason: "",
      });
      await ctx.db.insert("organizationRequests", {
        profileId: two,
        organizationId,
        classId: otherClass,
        time: 2,
        state: "P",
        reason: "",
      });
    });

    const asTutor = await t
      .withIdentity({ subject: "user_tutor" })
      .query(api.organizations.reviewRequests, { slug: "school" });
    expect(asTutor.editAll).toBe(false);
    expect(asTutor.requests.map((row) => row.username)).toEqual(["mine"]);

    const asOrgAdmin = await t
      .withIdentity({ subject: "user_orgadmin" })
      .query(api.organizations.reviewRequests, { slug: "school" });
    expect(asOrgAdmin.requests.map((row) => row.username)).toEqual(["mine", "theirs"]);
  });

  test("approving past the slot limit is refused", async () => {
    const t = setupConvexTest();
    const requestId = await t.run(async (ctx) => {
      const admin = await makeProfile(ctx, "admin");
      const hopeful = await makeProfile(ctx, "hopeful");
      const seated = await makeProfile(ctx, "seated");
      const organizationId = await makeOrganization(ctx, "tiny", {
        isOpen: false,
        slots: 1,
        adminProfileIds: [admin],
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        profileId: seated,
        order: 0,
      });
      await ctx.db.patch(organizationId, { memberCount: 1 });
      return await ctx.db.insert("organizationRequests", {
        profileId: hopeful,
        organizationId,
        time: 1,
        state: "P",
        reason: "",
      });
    });

    await expect(
      t.withIdentity({ subject: "user_admin" }).mutation(api.organizations.approve, { requestId }),
    ).rejects.toThrow(/0 more members/);
  });
});

describe("organizations.members and list", () => {
  test("listed members are ranked and unlisted ones are hidden", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const organizationId = await makeOrganization(ctx, "maps", { name: "MAPS" });
      const rows: [string, number, boolean][] = [
        ["one", 300, false],
        ["two", 200, false],
        ["three", 200, false],
        ["ghost", 900, true],
      ];
      let order = 0;
      for (const [username, points, unlisted] of rows) {
        const profileId = await makeProfile(ctx, username, {
          points,
          performancePoints: points,
          isUnlisted: unlisted,
        });
        await ctx.db.insert("organizationMemberships", {
          organizationId,
          profileId,
          order: order++,
        });
      }
      await ctx.db.patch(organizationId, { memberCount: 4 });
    });

    const page = await t.query(api.organizations.members, { slug: "maps" });
    expect(page.members.map((row) => [row.username, row.rank])).toEqual([
      ["one", 1],
      ["two", 2],
      ["three", 2],
    ]);
    expect(page.total).toBe(3);
  });

  test("the list shows member counts and viewer membership", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "member");
      const mine = await makeOrganization(ctx, "mine", { name: "Mine" });
      await makeOrganization(ctx, "other", { name: "Other" });
      await ctx.db.insert("organizationMemberships", {
        organizationId: mine,
        profileId,
        order: 0,
      });
      await ctx.db.patch(mine, { memberCount: 1 });
    });

    const rows = await t.withIdentity({ subject: "user_member" }).query(api.organizations.list, {});
    expect(rows.map((row) => [row.slug, row.memberCount, row.viewerIsMember])).toEqual([
      ["mine", 1, true],
      ["other", 0, false],
    ]);
  });
});

describe("classes", () => {
  test("joining with the access code needs organisation membership first", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const profileId = await makeProfile(ctx, "student");
      const organizationId = await makeOrganization(ctx, "maps");
      await ctx.db.insert("classes", {
        organizationId,
        name: "Tutorial",
        slug: "tut",
        isActive: true,
        accessCode: "OPEN42",
        adminProfileIds: [],
        memberProfileIds: [],
      });
      void profileId;
    });

    const asStudent = t.withIdentity({ subject: "user_student" });
    await expect(
      asStudent.mutation(api.classes.join, {
        organizationSlug: "maps",
        classSlug: "tut",
        accessCode: "OPEN42",
      }),
    ).rejects.toThrow(/must join/);

    await asStudent.mutation(api.organizations.join, { slug: "maps" });
    await expect(
      asStudent.mutation(api.classes.join, {
        organizationSlug: "maps",
        classSlug: "tut",
        accessCode: "WRONG",
      }),
    ).rejects.toThrow(/access code is not correct/);

    await asStudent.mutation(api.classes.join, {
      organizationSlug: "maps",
      classSlug: "tut",
      accessCode: "OPEN42",
    });
    const detail = await asStudent.query(api.classes.get, {
      organizationSlug: "maps",
      classSlug: "tut",
    });
    expect(detail?.viewer.isMember).toBe(true);
    expect(detail?.memberCount).toBe(1);
  });

  test("an organisation admin can create and edit a class", async () => {
    const t = setupConvexTest();
    await t.run(async (ctx) => {
      const admin = await makeProfile(ctx, "admin");
      await makeProfile(ctx, "outsider");
      await makeOrganization(ctx, "maps", { adminProfileIds: [admin] });
    });

    const asAdmin = t.withIdentity({ subject: "user_admin" });
    await asAdmin.mutation(api.classes.create, {
      organizationSlug: "maps",
      name: "Week 1",
      slug: "week-1",
      accessCode: "W1",
    });

    await expect(
      t.withIdentity({ subject: "user_outsider" }).mutation(api.classes.update, {
        organizationSlug: "maps",
        classSlug: "week-1",
        name: "Hacked",
      }),
    ).rejects.toThrow(/permission/);

    await asAdmin.mutation(api.classes.update, {
      organizationSlug: "maps",
      classSlug: "week-1",
      name: "Week One",
      isActive: false,
    });

    const listed = await t.query(api.classes.listForOrganization, {
      organizationSlug: "maps",
      activeOnly: false,
    });
    expect(listed.map((row) => [row.name, row.isActive])).toEqual([["Week One", false]]);
  });
});
