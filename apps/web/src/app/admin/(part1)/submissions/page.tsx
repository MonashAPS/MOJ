import { Suspense } from "react";
import { SubmissionsAdmin } from "./SubmissionsAdmin";

export const metadata = { title: "Submissions" };

export default function AdminSubmissionsPage() {
  return (
    <Suspense fallback={null}>
      <SubmissionsAdmin />
    </Suspense>
  );
}
