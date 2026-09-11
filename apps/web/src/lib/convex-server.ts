import { fetchMutation, fetchQuery } from "convex/nextjs";
import type { FunctionReference } from "convex/server";
import { getConvexToken } from "@/auth/session";

const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? "http://127.0.0.1:3210";

export function convexOptions(token?: string | null) {
  return token ? { url, token } : { url };
}

/** Public read: no identity attached. */
export async function query<Q extends FunctionReference<"query">>(
  reference: Q,
  args: Q["_args"],
): Promise<Q["_returnType"]> {
  return await fetchQuery(reference, args, convexOptions());
}

/** Read as the signed-in user, if there is one. */
export async function queryAsViewer<Q extends FunctionReference<"query">>(
  reference: Q,
  args: Q["_args"],
): Promise<Q["_returnType"]> {
  const token = await getConvexToken();
  return await fetchQuery(reference, args, convexOptions(token));
}

export async function mutateAsViewer<M extends FunctionReference<"mutation">>(
  reference: M,
  args: M["_args"],
): Promise<M["_returnType"]> {
  const token = await getConvexToken();
  return await fetchMutation(reference, args, convexOptions(token));
}
