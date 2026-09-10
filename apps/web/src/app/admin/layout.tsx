import { api } from "@convex/_generated/api";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AdminChrome } from "@/components/admin";
import { ErrorScreen } from "@/components/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";

export const metadata: Metadata = {
  title: { default: "Staff console", template: "%s - Staff console" },
  robots: { index: false, follow: false },
};

/** SPEC section 8: the console is staff only, and says so rather than 404ing. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await queryAsViewer(api.viewer.current, {}).catch(() => null);
  const profile = viewer?.profile ?? null;
  const isStaff = !!profile && (profile.isStaff || profile.isSuperuser);

  if (!isStaff) {
    return <ErrorScreen code={403} id="AccessDenied" description="Access denied" />;
  }

  return <AdminChrome>{children}</AdminChrome>;
}
