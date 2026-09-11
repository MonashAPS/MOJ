import { Alert, AlertTitle, Button } from "@moj/ui";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";

export const metadata = { title: "Password changed" };

export default function PasswordChangeDonePage() {
  return (
    <AuthCard
      title="Password changed"
      subtitle="Your other sessions have been signed out."
      footer={
        <span>
          Somewhere to be? <Link href="/problems/">Back to the problems</Link>
        </span>
      }
    >
      <div className="grid gap-4">
        <Alert variant="success">
          <CheckCircle2 className="size-3.5" aria-hidden />
          <AlertTitle>Your password was successfully changed.</AlertTitle>
        </Alert>
        <Button asChild full>
          <Link href="/edit/profile/">Back to your profile</Link>
        </Button>
      </div>
    </AuthCard>
  );
}
