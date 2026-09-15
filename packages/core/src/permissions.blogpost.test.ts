/**
 * judge/models/tests/test_blogpost.py, ported, plus Comment.is_accessible_by
 * from judge/models/comment.py.
 */

import { describe, expect, it } from "vitest";
import {
  blogPostCanSee,
  blogPostIsEditableBy,
  canViewOrganizationRequest,
  commentIsAccessibleBy,
  organizationCanReviewAllRequests,
  organizationCanReviewClassRequests,
  organizationIsAdmin,
  organizationIsEditableBy,
} from "./permissions";
import {
  commonUsers,
  createBlogPost,
  createContest,
  createProblem,
  createSolution,
  createUser,
  DAY,
  NOW,
  OPEN_ORGANIZATION,
} from "./test.fixtures";
import type { Viewer } from "./types";

const users = commonUsers();
users.staff_blogpost_edit_own = createUser("staff_blogpost_edit_own", {
  isStaff: true,
  permissions: ["change_blogpost"],
});
users.staff_blogpost_edit_all = createUser("staff_blogpost_edit_all", {
  isStaff: true,
  permissions: ["change_blogpost", "edit_all_post"],
});

const basicBlogPost = createBlogPost("basic", { authorProfileIds: ["staff_blogpost_edit_own"] });
const visibleBlogPost = createBlogPost("visible", { visible: true });

function check(
  post: typeof basicBlogPost,
  expectations: Record<string, { can_see?: boolean; is_editable_by?: boolean }>,
): void {
  for (const [username, methods] of Object.entries(expectations)) {
    const viewer = users[username] as Viewer;
    if (methods.can_see !== undefined) {
      expect(blogPostCanSee(post, viewer, NOW), `can_see/${username}`).toBe(methods.can_see);
    }
    if (methods.is_editable_by !== undefined) {
      expect(blogPostIsEditableBy(post, viewer), `is_editable_by/${username}`).toBe(methods.is_editable_by);
    }
  }
}

describe("BlogPostTestCase", () => {
  it("test_basic_blogpost_methods", () => {
    check(basicBlogPost, {
      superuser: { can_see: true, is_editable_by: true },
      staff_blogpost_edit_own: { can_see: true, is_editable_by: true },
      staff_blogpost_edit_all: { can_see: true, is_editable_by: true },
      normal: { can_see: false, is_editable_by: false },
      anonymous: { can_see: false, is_editable_by: false },
    });
  });

  it("test_visible_blogpost_methods", () => {
    check(visibleBlogPost, {
      superuser: { can_see: true, is_editable_by: true },
      staff_blogpost_edit_own: { can_see: true, is_editable_by: false },
      normal: { can_see: true, is_editable_by: false },
      anonymous: { can_see: true, is_editable_by: false },
    });
  });

  it("hides a visible post until its publish date", () => {
    const scheduled = createBlogPost("scheduled", { visible: true, publishOn: NOW + DAY });
    expect(blogPostCanSee(scheduled, users.normal, NOW)).toBe(false);
    expect(blogPostCanSee(scheduled, users.normal, NOW + 2 * DAY)).toBe(true);
  });
});

describe("Comment.is_accessible_by", () => {
  it("defers to the page the comment hangs off", () => {
    const publicProblem = createProblem("public", { isPublic: true });
    const privateProblem = createProblem("private");

    expect(commentIsAccessibleBy({ type: "problem", problem: publicProblem }, users.normal)).toBe(true);
    expect(commentIsAccessibleBy({ type: "problem", problem: privateProblem }, users.normal)).toBe(false);

    // A deleted page makes the comment inaccessible (ObjectDoesNotExist).
    expect(commentIsAccessibleBy({ type: "problem", problem: null }, users.superuser)).toBe(false);

    expect(
      commentIsAccessibleBy(
        {
          type: "solution",
          problem: privateProblem,
          solution: createSolution("private", { isPublic: true, publishOn: NOW - DAY }),
        },
        users.normal,
        { now: NOW },
      ),
    ).toBe(true);

    const visibleContest = createContest("open", { isVisible: true });
    const hiddenContest = createContest("hidden");
    expect(commentIsAccessibleBy({ type: "contest", contest: visibleContest }, users.normal)).toBe(true);
    expect(commentIsAccessibleBy({ type: "contest", contest: hiddenContest }, users.normal)).toBe(false);

    expect(commentIsAccessibleBy({ type: "blog", post: visibleBlogPost }, users.normal, { now: NOW })).toBe(
      true,
    );
    expect(commentIsAccessibleBy({ type: "blog", post: basicBlogPost }, users.normal, { now: NOW })).toBe(
      false,
    );

    expect(commentIsAccessibleBy({ type: "other" }, null)).toBe(true);
  });
});

describe("Organization permissions", () => {
  const klass = {
    id: "class-1",
    organizationId: "open",
    isActive: true,
    adminProfileIds: ["normal"],
    memberProfileIds: [],
  };

  it("recognises organization admins", () => {
    expect(organizationIsAdmin(OPEN_ORGANIZATION, users.staff_organization_admin)).toBe(true);
    expect(organizationIsAdmin(OPEN_ORGANIZATION, users.normal)).toBe(false);
    expect(organizationIsAdmin(OPEN_ORGANIZATION, null)).toBe(false);
    expect(organizationCanReviewAllRequests(OPEN_ORGANIZATION, users.staff_organization_admin)).toBe(true);
  });

  it("lets class admins review class requests", () => {
    expect(organizationCanReviewClassRequests([klass], users.normal)).toBe(true);
    expect(organizationCanReviewClassRequests([klass], users.superuser)).toBe(false);
  });

  it("gates the admin-site edit on change_organization", () => {
    const orgAdminNoChange = createUser("org_admin", { adminOfOrganizationIds: ["open"] });
    expect(organizationIsEditableBy(OPEN_ORGANIZATION, orgAdminNoChange)).toBe(false);

    const orgAdmin = createUser("staff_organization_admin", {
      permissions: ["change_organization"],
    });
    expect(organizationIsEditableBy(OPEN_ORGANIZATION, orgAdmin)).toBe(true);

    const editAll = createUser("editor", {
      permissions: ["change_organization", "edit_all_organization"],
    });
    expect(organizationIsEditableBy(OPEN_ORGANIZATION, editAll)).toBe(true);
  });

  it("shows a join request to its author, the org admins and the class admins", () => {
    const request = { profileId: "applicant" };
    const applicant = createUser("applicant");
    expect(canViewOrganizationRequest(request, OPEN_ORGANIZATION, null, applicant)).toBe(true);
    expect(canViewOrganizationRequest(request, OPEN_ORGANIZATION, null, users.staff_organization_admin)).toBe(
      true,
    );
    expect(canViewOrganizationRequest(request, OPEN_ORGANIZATION, klass, users.normal)).toBe(true);
    expect(canViewOrganizationRequest(request, OPEN_ORGANIZATION, null, users.normal)).toBe(false);
    expect(canViewOrganizationRequest(request, OPEN_ORGANIZATION, null, null)).toBe(false);
  });
});
