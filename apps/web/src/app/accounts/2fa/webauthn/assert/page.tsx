import { safeNext } from "@/lib/next-path";
import { AssertClient } from "./AssertClient";

export const metadata = { title: "Use a passkey" };

export default async function AssertPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AssertClient next={safeNext(next)} />;
}
