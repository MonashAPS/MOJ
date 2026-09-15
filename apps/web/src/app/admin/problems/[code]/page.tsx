import { Suspense } from "react";
import { ProblemEditor } from "./ProblemEditor";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: code };
}

export default async function AdminProblemPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Suspense fallback={null}>
      <ProblemEditor code={code} />
    </Suspense>
  );
}
