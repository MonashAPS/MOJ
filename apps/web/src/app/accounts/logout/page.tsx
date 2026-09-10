import { Alert, AlertTitle, Button } from "@moj/ui";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { getServerSession } from "@/auth/session";
import { AuthCard } from "@/components/auth/AuthCard";
import { logOut } from "./actions";

export const metadata = { title: "Log out" };
export const dynamic = "force-dynamic";

export default async function LogoutPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  const session = done ? null : await getServerSession();

  if (done || !session) {
    return (
      <AuthCard
        title="See you later"
        subtitle="You are logged out."
        footer={
          <span>
            Back to <Link href="/">the front page</Link>
          </span>
        }
      >
        <div className="grid gap-4">
          <Alert variant="success">
            <LogOut className="size-3.5" aria-hidden />
            <AlertTitle>You have been logged out.</AlertTitle>
          </Alert>
          <Button asChild full>
            <Link href="/accounts/login/">Log back in</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  const username = (session.user as { username?: string | null }).username || session.user.name;

  return (
    <AuthCard
      title="Log out"
      subtitle={`You are logged in as ${username}.`}
      footer={
        <span>
          Changed your mind? <Link href="/">Back to the front page</Link>
        </span>
      }
    >
      <form action={logOut} className="grid gap-2">
        <Button type="submit" full icon={<LogOut aria-hidden />}>
          Log out
        </Button>
        <Button asChild variant="ghost" full>
          <Link href="/">Stay logged in</Link>
        </Button>
      </form>
    </AuthCard>
  );
}
