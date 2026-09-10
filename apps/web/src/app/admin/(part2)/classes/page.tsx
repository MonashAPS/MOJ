import { api } from "@convex/_generated/api";
import { EmptyState, TitleRow } from "@moj/ui";
import { GraduationCap } from "lucide-react";
import { queryAsViewer } from "@/lib/convex-server";
import { ClassesBrowser } from "./ClassesBrowser";

export const metadata = { title: "Classes" };

export default async function AdminClassesPage() {
  const organizations = await queryAsViewer(api.admin.organizations.list, {}).catch(() => []);

  return (
    <>
      <TitleRow title="Classes" />
      {organizations.length === 0 ? (
        <EmptyState
          icon={<GraduationCap aria-hidden />}
          title="No organizations"
          description="Classes live inside an organisation, and there are none yet."
        />
      ) : (
        <ClassesBrowser
          organizations={organizations.map((organization) => ({
            slug: organization.slug,
            name: organization.name,
            classCount: organization.classCount,
          }))}
        />
      )}
    </>
  );
}
