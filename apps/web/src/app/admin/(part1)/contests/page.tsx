import { Suspense } from "react";
import { ContestsList } from "./ContestsList";

export const metadata = { title: "Contests" };

export default function AdminContestsPage() {
  return (
    <Suspense fallback={null}>
      <ContestsList />
    </Suspense>
  );
}
