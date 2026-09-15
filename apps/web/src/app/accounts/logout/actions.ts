"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth/server";

/** DMOJ logs out with a POST, so the control is a form and the page is a
 *  confirmation rather than a link that ends a session on hover-prefetch. */
export async function logOut() {
  await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
  const jar = await cookies();

  for (const cookie of jar.getAll()) {
    if (cookie.name.startsWith("moj")) jar.delete(cookie.name);
  }

  redirect("/accounts/logout/?done=1");
}
