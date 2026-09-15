import { Suspense } from "react";
import { ContestEditor } from "./ContestEditor";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  return { title: key };
}

export default async function AdminContestPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  return (
    <Suspense fallback={null}>
      <ContestEditor contestKey={key} />
    </Suspense>
  );
}
