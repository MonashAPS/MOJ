"use client";

import Link from "next/link";

/** DMOJ's error page: a fake segfault on a blue screen. */
export function ErrorScreen({
  code,
  id,
  description,
  onRetry,
}: {
  code: number;
  id: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-screen">
      <h2>SIGSEGV: {id}</h2>
      <pre>
        {description}
        {"\n"}site: fatal signal: Segmentation fault{"\n"}
        site died (signal <b>{code}</b>, exit -11)
        {"\n\n"}panic: <Link href="/">go home</Link>
        {onRetry ? (
          <>
            {" | "}
            <button type="button" onClick={onRetry}>
              try again
            </button>
          </>
        ) : null}
      </pre>
    </div>
  );
}
