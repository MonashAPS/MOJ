"use client";

import type { Id } from "@convex/_generated/dataModel";
import { useTranslations } from "next-intl";
import { AdminShell } from "@/components/admin";
import { ProctorPlayer } from "../ProctorPlayer";

/** One session on its own page, for a link somebody was sent. */
export function ProctorReplay({ sessionId }: { sessionId: Id<"proctorSessions"> }) {
  const t = useTranslations("admin.proctor");
  return (
    <AdminShell
      title={t("title")}
      breadcrumb={[
        { label: t("breadcrumbConsole"), href: "/admin/" },
        { label: t("title"), href: "/admin/proctor/" },
      ]}
    >
      <ProctorPlayer sessionId={sessionId} />
    </AdminShell>
  );
}
