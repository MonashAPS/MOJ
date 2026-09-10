import { Suspense } from "react";
import { ProblemsList } from "./ProblemsList";

export const metadata = { title: "Problems" };

export default function AdminProblemsPage() {
  return (
    <Suspense fallback={null}>
      <ProblemsList />
    </Suspense>
  );
}
