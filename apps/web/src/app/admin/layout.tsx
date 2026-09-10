import { api } from "@convex/_generated/api";
import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { ErrorScreen } from "@/components/ErrorScreen";
import { queryAsViewer } from "@/lib/convex-server";

export const metadata = { title: { default: "Console", template: "%s - Console" } };

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const state = await queryAsViewer(api.viewer.current, {}).catch(() => null);
  const profile = state?.profile ?? null;
  if (!profile || !(profile.isStaff || profile.isSuperuser)) {
    return <ErrorScreen code={403} id="AccessDenied" description="Access denied" />;
  }

  return <AdminShell>{children}</AdminShell>;
}
