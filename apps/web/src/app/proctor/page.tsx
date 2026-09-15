import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getServerSession } from "@/auth/session";
import { ProctorClient } from "@/components/proctor/ProctorClient";
import { queryAsViewer } from "@/lib/convex-server";
import { gravatarUrl } from "@/lib/gravatar";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.proctor");

  return { title: t("title") };
}

/**
 * Being proctored is a state the account is in, so this page belongs to the
 * account and not to any contest. Someone can open it with no contest running;
 * a contest that asks for proctoring simply checks whether they did.
 *
 * It draws itself full-bleed over the club's backdrop rather than inside the
 * site's content column. What it asks for is unusual enough to deserve the
 * whole window, and the nav would only offer somewhere else to go.
 */
export default async function ProctorPage() {
  const t = await getTranslations("common.proctor");
  const session = await getServerSession().catch(() => null);

  // Signing in is the first thing this needs, so send them to do it and bring
  // them back, rather than refusing a page they are entitled to.
  if (!session) redirect(`/accounts/login/?next=${encodeURIComponent("/proctor/")}`);

  const viewer = await queryAsViewer(api.viewer.current, {}).catch(() => null);
  const profile = viewer?.profile ?? null;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-(--gutter) py-10">
      {/* Who this will be recorded against. Small, and at the top, because the
          one thing worth checking before you share a screen is whose account
          you are signed in to. */}
      <div className="mb-5 flex items-center gap-2 rounded-full border border-border bg-card/90 py-1 pl-1 pr-3 shadow-xs backdrop-blur-sm">
        <img
          src={gravatarUrl(session.user.email, 48)}
          alt=""
          width={24}
          height={24}
          className="size-6 rounded-full"
        />
        <span className="text-sm font-medium">
          {profile?.usernameDisplayOverride || profile?.username || session.user.email}
        </span>
      </div>

      <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6 shadow-lg min-[560px]:p-8">
        <h1 className="font-display text-h2 font-semibold tracking-tight">{t("title")}</h1>
        <hr className="page-rule my-6" />
        <ProctorClient />
      </div>
    </main>
  );
}
