import { Suspense } from "react";
import { JobsList } from "./JobsList";

export const metadata = { title: "Jobs" };

export default function AdminJobsPage() {
  return (
    <Suspense fallback={null}>
      <JobsList />
    </Suspense>
  );
}
