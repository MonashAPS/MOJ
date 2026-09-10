import { headers } from "next/headers";
import { auth } from "./server";

export async function getServerSession() {
  return await auth.api.getSession({ headers: await headers() });
}

/** JWT for server components that need to call Convex as the signed-in user.
 *  Returns null when nobody is signed in. */
export async function getConvexToken(): Promise<string | null> {
  try {
    const result = await auth.api.getToken({ headers: await headers() });
    return (result as { token?: string } | null)?.token ?? null;
  } catch {
    return null;
  }
}
