"use client";

import { UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { authClient } from "@/auth/client";

/** django-impersonate paints a bar across the top of every page so a staff
 *  member cannot forget whose account they are looking at. This is that bar. */
export function ImpersonationBar({ username }: { username: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div
      data-chrome="dark"
      className="flex h-(--contest-bar-height) items-center gap-3 border-b border-warn/40 bg-warn px-4 text-nav"
    >
      <UserX size={15} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-base font-semibold">
        {t.rich("impersonation.banner", {
          username,
          name: (chunks) => <span className="font-mono">{chunks}</span>,
        })}
      </span>
      <button
        type="button"
        aria-busy={busy || undefined}
        className="shrink-0 rounded-xs px-2 py-0.5 text-base font-semibold underline underline-offset-2 hover:bg-black/10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-royal/60"
        onClick={async () => {
          setBusy(true);

          try {
            await authClient.admin.stopImpersonating();
            router.push("/admin/users/");
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("impersonation.stopping") : t("nav.stopImpersonating")}
      </button>
    </div>
  );
}
