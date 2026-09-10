import { Alert, AlertTitle, Button } from "@moj/ui";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata = { title: "Password set" };

export default function PasswordResetCompletePage() {
  return (
    <AuthCard
      title="Password set"
      subtitle="You can log in with it now."
      footer={
        <span>
          New here after all? <Link href="/accounts/register/">Create an account</Link>
        </span>
      }
    >
      <div className="grid gap-4">
        <Alert variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>Your password has been set.</AlertTitle>
        </Alert>
        <Button asChild full>
          <Link href="/accounts/login/">Log in</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
