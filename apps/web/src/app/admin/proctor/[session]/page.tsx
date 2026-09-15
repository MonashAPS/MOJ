import type { Id } from "@convex/_generated/dataModel";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ProctorReplay } from "./ProctorReplay";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.proctor");

  return { title: t("title") };
}

export default async function AdminProctorSessionPage({ params }: { params: Promise<{ session: string }> }) {
  const { session } = await params;

  return (
    <Suspense fallback={null}>
      <ProctorReplay
        // SAFETY: the segment is the `_id` the console's session list links to, and
        // Convex refuses any string that is not an id of `proctorSessions`.
        sessionId={session as Id<"proctorSessions">}
      />
    </Suspense>
  );
}
