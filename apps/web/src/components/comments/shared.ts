/** Shared by the server component that pre-renders the tree and the client that
 *  re-renders the rows a live update changed. Neither directive belongs here. */

import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type CommentTargetType = "problem" | "contest" | "blog" | "solution";

export type CommentList = NonNullable<FunctionReturnType<typeof api.comments.list>>;

export type CommentNode = CommentList["comments"][number];

/** Rendered HTML is cached per body, so an edit invalidates exactly one row. */
export function commentHtmlKey(comment: { _id: string; body: string }): string {
  return `${comment._id} ${comment.body}`;
}

/** DMOJ's `#comment-<id>` anchor, on the imported id where there is one. */
export function commentAnchor(comment: { _id: string; legacyId?: number }): string {
  return `comment-${comment.legacyId ?? comment._id}`;
}
