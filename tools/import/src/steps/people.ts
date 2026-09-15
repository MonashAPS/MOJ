import type { ImportContext } from "../context.ts";
import { groupM2M } from "../context.ts";
import type { Row } from "../rows.ts";
import type { Step } from "./types.ts";

const DISPLAY_RANKS = new Set(["user", "setter", "admin"]);

const SITE_THEMES = new Set(["auto", "light", "dark"]);

const REQUEST_STATES = new Set(["P", "A", "R"]);

interface PermissionIndex {
  /** auth_user.id -> permission codes such as judge.edit_all_problem */
  permissions: Map<number, string[]>;
  /** auth_user.id -> group names */
  groups: Map<number, string[]>;
}

async function buildPermissionIndex(ctx: ImportContext): Promise<PermissionIndex> {
  const contentTypes = new Map<number, string>();

  for await (const row of ctx.rows("django_content_type")) {
    contentTypes.set(row.id(), row.s("app_label"));
  }

  const permissionCodes = new Map<number, string>();

  for await (const row of ctx.rows("auth_permission")) {
    const app = contentTypes.get(row.n("content_type_id")) ?? "judge";
    permissionCodes.set(row.id(), `${app}.${row.s("codename")}`);
  }

  const groupNames = new Map<number, string>();

  for await (const row of ctx.rows("auth_group")) {
    groupNames.set(row.id(), row.s("name"));
  }

  const groupPermissions = new Map<number, number[]>();

  for await (const row of ctx.rows("auth_group_permissions")) {
    const list = groupPermissions.get(row.n("group_id"));

    if (list) list.push(row.n("permission_id"));
    else groupPermissions.set(row.n("group_id"), [row.n("permission_id")]);
  }

  const permissions = new Map<number, Set<string>>();
  const groups = new Map<number, string[]>();

  const add = (userId: number, permissionId: number) => {
    const code = permissionCodes.get(permissionId);

    if (!code) return;
    const set = permissions.get(userId) ?? new Set<string>();
    set.add(code);
    permissions.set(userId, set);
  };

  for await (const row of ctx.rows("auth_user_user_permissions")) {
    add(row.n("user_id"), row.n("permission_id"));
  }

  for await (const row of ctx.rows("auth_user_groups")) {
    const userId = row.n("user_id");
    const groupId = row.n("group_id");
    const name = groupNames.get(groupId);

    if (name) {
      const list = groups.get(userId) ?? [];
      list.push(name);
      groups.set(userId, list);
    }

    for (const permissionId of groupPermissions.get(groupId) ?? []) add(userId, permissionId);
  }

  return {
    permissions: new Map([...permissions].map(([id, set]) => [id, [...set].sort()])),
    groups,
  };
}

async function loadAuthUsers(ctx: ImportContext): Promise<Map<number, Row>> {
  const users = new Map<number, Row>();

  for await (const row of ctx.rows("auth_user")) users.set(row.id(), row);

  return users;
}

const profilesStep: Step = {
  table: "profiles",
  sources: [
    "judge_profile",
    "auth_user",
    "auth_user_groups",
    "auth_user_user_permissions",
    "auth_group_permissions",
  ],
  async run(ctx) {
    const emitter = ctx.emitter("profiles");
    const users = await loadAuthUsers(ctx);
    const index = await buildPermissionIndex(ctx);
    const seenUsers = new Set<number>();

    for await (const row of ctx.rows("judge_profile")) {
      ctx.report.counts("profiles").read++;
      const legacyUserId = row.n("user_id");
      const user = users.get(legacyUserId);

      if (!user) {
        ctx.report.skip("profiles", "judge_profile row has no auth_user row", row.id());
        continue;
      }

      seenUsers.add(legacyUserId);

      const displayRank = row.s("display_rank");

      if (!DISPLAY_RANKS.has(displayRank)) {
        ctx.report.warn("profiles", `unknown display_rank ${displayRank}, stored as user`, row.id());
      }

      const siteTheme = row.s("site_theme");

      await emitter.emit({
        userId: `u${legacyUserId}`,
        username: user.s("username"),
        legacyUserId,
        about: row.s("about"),
        timezone: row.s("timezone"),
        languageId: ctx.ref("languages", row.nOpt("language_id"), "judge_profile", "language_id", row.id()),
        points: row.n("points"),
        performancePoints: row.n("performance_points"),
        problemCount: row.n("problem_count"),
        rating: row.nOpt("rating"),
        displayRank: DISPLAY_RANKS.has(displayRank) ? displayRank : "user",
        mute: row.b("mute"),
        isUnlisted: row.b("is_unlisted"),
        isBannedFromProblemVoting: row.b("is_banned_from_problem_voting"),
        mathEngine: row.s("math_engine"),
        siteTheme: SITE_THEMES.has(siteTheme) ? siteTheme : "auto",
        editorTheme: row.s("ace_theme"),
        lastAccess: row.tOpt("last_access"),
        ip: row.sOpt("ip"),
        notes: row.s("notes"),
        legacyApiTokenHash: row.sOpt("api_token"),
        dataLastDownloaded: row.tOpt("data_last_downloaded"),
        usernameDisplayOverride: row.sOpt("username_display_override"),
        isStaff: user.b("is_staff"),
        isSuperuser: user.b("is_superuser"),
        permissions: index.permissions.get(legacyUserId) ?? [],
        groups: index.groups.get(legacyUserId) ?? [],
        joinDate: user.t("date_joined"),
        legacyId: row.id(),
      });
    }

    const orphans = [...users.keys()].filter((id) => !seenUsers.has(id));

    if (orphans.length > 0) {
      ctx.report.note(
        `${orphans.length} auth_user rows have no judge_profile row; they get a Better Auth user but no profile`,
      );
    }
  },
};

const organizationsStep: Step = {
  table: "organizations",
  sources: ["judge_organization", "judge_organization_admins", "judge_profile_organizations"],
  async run(ctx) {
    const emitter = ctx.emitter("organizations");
    const admins = await groupM2M(ctx, "judge_organization_admins", "organization_id", "profile_id");
    const memberCounts = new Map<number, number>();

    for await (const row of ctx.rows("judge_profile_organizations")) {
      const org = row.n("organization_id");
      memberCounts.set(org, (memberCounts.get(org) ?? 0) + 1);
    }

    for await (const row of ctx.rows("judge_organization")) {
      ctx.report.counts("organizations").read++;
      await emitter.emit({
        name: row.s("name"),
        slug: row.s("slug"),
        shortName: row.s("short_name"),
        about: row.s("about"),
        adminProfileIds: ctx.refs(
          "profiles",
          admins.get(row.id()),
          "judge_organization_admins",
          "profile_id",
          row.id(),
        ),
        isOpen: row.b("is_open"),
        slots: row.nOpt("slots"),
        accessCode: row.sOpt("access_code"),
        logoOverrideImage: row.sOpt("logo_override_image"),
        classRequired: row.b("class_required"),
        memberCount: memberCounts.get(row.id()) ?? 0,
        legacyId: row.id(),
      });
    }
  },
};

const organizationMembershipsStep: Step = {
  table: "organizationMemberships",
  sources: ["judge_profile_organizations"],
  async run(ctx) {
    const emitter = ctx.emitter("organizationMemberships");

    for await (const row of ctx.rows("judge_profile_organizations")) {
      ctx.report.counts("organizationMemberships").read++;

      const organizationId = ctx.ref(
        "organizations",
        row.n("organization_id"),
        "judge_profile_organizations",
        "organization_id",
        row.id(),
      );

      const profileId = ctx.ref(
        "profiles",
        row.n("profile_id"),
        "judge_profile_organizations",
        "profile_id",
        row.id(),
      );

      if (!organizationId || !profileId) {
        ctx.report.skip("organizationMemberships", "organization or profile missing", row.id());
        continue;
      }

      await emitter.emit({
        organizationId,
        profileId,
        order: row.n("sort_value"),
        legacyId: row.id(),
      });
    }
  },
};

const classesStep: Step = {
  table: "classes",
  sources: ["judge_class", "judge_class_admins", "judge_class_members"],
  async run(ctx) {
    const emitter = ctx.emitter("classes");
    const admins = await groupM2M(ctx, "judge_class_admins", "class_id", "profile_id");
    const members = await groupM2M(ctx, "judge_class_members", "class_id", "profile_id");

    for await (const row of ctx.rows("judge_class")) {
      ctx.report.counts("classes").read++;

      const organizationId = ctx.ref(
        "organizations",
        row.n("organization_id"),
        "judge_class",
        "organization_id",
        row.id(),
      );

      if (!organizationId) {
        ctx.report.skip("classes", "organization missing", row.id());
        continue;
      }

      await emitter.emit({
        organizationId,
        name: row.s("name"),
        slug: row.s("slug"),
        isActive: row.b("is_active"),
        accessCode: row.sOpt("access_code"),
        adminProfileIds: ctx.refs(
          "profiles",
          admins.get(row.id()),
          "judge_class_admins",
          "profile_id",
          row.id(),
        ),
        memberProfileIds: ctx.refs(
          "profiles",
          members.get(row.id()),
          "judge_class_members",
          "profile_id",
          row.id(),
        ),
        legacyId: row.id(),
      });
    }
  },
};

const organizationRequestsStep: Step = {
  table: "organizationRequests",
  sources: ["judge_organizationrequest"],
  async run(ctx) {
    const emitter = ctx.emitter("organizationRequests");

    for await (const row of ctx.rows("judge_organizationrequest")) {
      ctx.report.counts("organizationRequests").read++;

      const profileId = ctx.ref(
        "profiles",
        row.n("user_id"),
        "judge_organizationrequest",
        "user_id",
        row.id(),
      );

      const organizationId = ctx.ref(
        "organizations",
        row.n("organization_id"),
        "judge_organizationrequest",
        "organization_id",
        row.id(),
      );

      if (!profileId || !organizationId) {
        ctx.report.skip("organizationRequests", "profile or organization missing", row.id());
        continue;
      }

      const state = row.s("state");
      await emitter.emit({
        profileId,
        organizationId,
        classId: ctx.ref(
          "classes",
          row.nOpt("request_class_id"),
          "judge_organizationrequest",
          "request_class_id",
          row.id(),
        ),
        time: row.t("time"),
        state: REQUEST_STATES.has(state) ? state : "P",
        reason: row.s("reason"),
        legacyId: row.id(),
      });
    }
  },
};

export const peopleSteps: Step[] = [
  profilesStep,
  organizationsStep,
  organizationMembershipsStep,
  classesStep,
  organizationRequestsStep,
];
