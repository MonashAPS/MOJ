"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

/**
 * Names to ids, for the admin forms that collect usernames, organisation slugs,
 * class names and tag names and save profile ids.
 *
 * The resolution is a Convex query, so it answers `undefined` for the first
 * render or two. The forms used to read `?.ids ?? {}` and `?? []` through that
 * window and drop whatever had not arrived, which turned a fast save into an
 * empty organisation list written over a populated one, and a mistyped username
 * into a silently shorter author list.
 *
 * So the resolution reports why a save may not go ahead: `blockedMessage` is
 * non-null while the queries are in flight, and again once they answer with a
 * name nothing matched. A caller refuses the save and shows it. The ids are
 * only worth sending when it is null.
 */
export interface ResolvedRefs {
  /** The profile ids for a list of usernames, in order, once nothing is missing. */
  profileIdsFor: (usernames: readonly string[]) => Id<"profiles">[];
  organizationIds: Id<"organizations">[];
  joinOrganizationIds: Id<"organizations">[];
  classIds: Id<"classes">[];
  tagIds: Id<"contestTags">[];
  /** Why a save may not go ahead, ready to show, or null when it may. */
  blockedMessage: string | null;
}

export interface ResolveRefsArgs {
  usernames?: readonly string[];
  organizationSlugs?: readonly string[];
  joinOrganizationSlugs?: readonly string[];
  classNames?: readonly string[];
  tagNames?: readonly string[];
}

/** Whether this form names anything of a given kind at all. */
function anyNamed(args: ResolveRefsArgs): boolean {
  return (
    (args.organizationSlugs?.length ?? 0) > 0 ||
    (args.joinOrganizationSlugs?.length ?? 0) > 0 ||
    (args.classNames?.length ?? 0) > 0 ||
    (args.tagNames?.length ?? 0) > 0
  );
}

export function useResolvedRefs(args: ResolveRefsArgs): ResolvedRefs {
  const t = useTranslations("admin.components.refs");
  const usernames = [...(args.usernames ?? [])];

  // `skip` rather than an empty query: a form that names nobody has nothing to
  // wait for, and should not be blocked on a round trip that answers `{}`.
  const profiles = useQuery(
    api.pages.admin.console.resolveProfiles,
    usernames.length > 0 ? { usernames } : "skip",
  );

  const wantsRefs = anyNamed(args);

  const refs = useQuery(
    api.pages.admin.console.resolveContestRefs,
    wantsRefs
      ? {
          organizationSlugs: [...(args.organizationSlugs ?? [])],
          joinOrganizationSlugs: [...(args.joinOrganizationSlugs ?? [])],
          classNames: [...(args.classNames ?? [])],
          tagNames: [...(args.tagNames ?? [])],
        }
      : "skip",
  );

  const loading = (usernames.length > 0 && !profiles) || (wantsRefs && !refs);
  const missing = [...(profiles?.missing ?? []), ...(refs?.missing ?? [])];

  return {
    profileIdsFor: (list) => {
      const ids = profiles?.ids ?? {};

      // Callers only send these once `blockedMessage` is null, which means every
      // name resolved; the fallbacks are for the render passes before that.
      return list.flatMap((username) => {
        const id = ids[username];

        return id ? [id] : [];
      });
    },
    organizationIds: refs?.organizationIds ?? [],
    joinOrganizationIds: refs?.joinOrganizationIds ?? [],
    classIds: refs?.classIds ?? [],
    tagIds: refs?.tagIds ?? [],
    blockedMessage: loading
      ? t("stillResolving")
      : missing.length > 0
        ? t("unknownNames", { names: missing.join(", ") })
        : null,
  };
}
