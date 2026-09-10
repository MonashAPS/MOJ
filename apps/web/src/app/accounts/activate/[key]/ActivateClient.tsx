"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/auth/client";

type State = "working" | "done" | "failed";

export function ActivateClient({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("working");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const result = await authClient.verifyEmail({ query: { token } });
      if (result.error) {
        setState("failed");
        setMessage(result.error.message ?? "This activation link is no longer valid.");
        return;
      }
      setState("done");
      router.refresh();
    })();
  }, [token, router]);

  if (state === "working") {
    return <p className="content-description">Activating your account...</p>;
  }

  if (state === "failed") {
    return (
      <div className="content-description" style={{ maxWidth: "45em" }}>
        <div className="alert alert-danger">{message}</div>
        <p>
          Activation links expire after seven days. You can{" "}
          <Link href="/accounts/register/">register again</Link>, or open a ticket if you think this is wrong.
        </p>
      </div>
    );
  }

  return (
    <div className="content-description" style={{ maxWidth: "45em" }}>
      <div className="alert alert-success">Your account is active.</div>
      <p>
        You are all set. <Link href="/accounts/login/">Log in</Link> and start solving, or head straight to
        the <Link href="/problems/">problem list</Link>.
      </p>
    </div>
  );
}
