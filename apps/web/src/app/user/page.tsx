import { api } from "@convex/_generated/api";
import { redirect } from "next/navigation";
import { queryAsViewer } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

/** DMOJ's `/user`: your own profile, or the login page if there is nobody to
 *  show one for. */
export default async function OwnUserPage() {
  const viewer = await queryAsViewer(api.viewer.current, {}).catch(() => null);
  const username = viewer?.profile?.username;
  if (!username) redirect("/accounts/login/?next=/user/");
  redirect(`/user/${encodeURIComponent(username)}/`);
}
