/**
 * Django's `user.is_staff` and `user.has_perm`, for the app.
 *
 * `@moj/core/permissions` is the source of truth for these rules, but it cannot
 * be imported here: `@moj/core` ships TypeScript source whose internal imports
 * carry `.js` specifiers, and Turbopack does not rewrite those to `.ts`, so the
 * module fails to resolve inside `apps/web`. These are the two smallest rules in
 * that file, copied verbatim; see docs/SPEC_CHANGES.md.
 */

export type ViewerProfile = {
  isStaff: boolean;
  isSuperuser: boolean;
  permissions: string[];
} | null;

export function isStaff(viewer: ViewerProfile): boolean {
  return viewer !== null && (viewer.isStaff === true || viewer.isSuperuser === true);
}

function codename(code: string): string {
  const dot = code.indexOf(".");
  return dot === -1 ? code : code.slice(dot + 1);
}

/** Superusers have everything; codes match fully qualified or bare, because the
 *  import carries DMOJ's `auth_permission.codename` values while the site asks
 *  with the app label attached. */
export function hasPerm(viewer: ViewerProfile, code: string): boolean {
  if (!viewer) return false;
  if (viewer.isSuperuser) return true;

  const permissions = viewer.permissions ?? [];
  if (permissions.includes(code)) return true;

  const bare = codename(code);
  return permissions.some((permission) => codename(permission) === bare);
}
