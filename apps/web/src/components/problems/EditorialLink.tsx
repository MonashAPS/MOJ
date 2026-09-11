"use client";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@moj/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";

/** The viewer's "don't ask me again" choice. localStorage only: there is no
 *  profile field for it, and it is a per-browser convenience, not a setting. */
const SKIP_KEY = "moj.editorial-confirmed";

function skipConfirm(): boolean {
  try {
    return window.localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberSkip(): void {
  try {
    window.localStorage.setItem(SKIP_KEY, "1");
  } catch {
    // A browser with storage denied simply asks again next time.
  }
}

/**
 * An editorial link that asks first (spec section 20). Reaching the editorial
 * from a problem page is a decision — it gives the intended solution away — so
 * the link opens a confirmation rather than navigating. A direct visit to
 * `/problem/<code>/editorial` is not intercepted; only this link is.
 */
export function EditorialLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [remember, setRemember] = useState(false);
  const checkboxId = useId();

  return (
    <>
      <Link
        href={href}
        className={className}
        onClick={(event) => {
          // A modified click still means "open it over there", untouched.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          if (skipConfirm()) return;
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Link>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent width={420}>
          <DialogHeader>
            <DialogTitle>View the editorial?</DialogTitle>
            <DialogDescription>
              The editorial reveals the intended solution to this problem.
            </DialogDescription>
          </DialogHeader>

          <Checkbox
            id={checkboxId}
            checked={remember}
            onCheckedChange={setRemember}
            label="Don't ask me again"
          />

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              No
            </Button>
            <Button
              onClick={() => {
                if (remember) rememberSkip();
                setOpen(false);
                router.push(href);
              }}
            >
              Yes, show it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The `linkAs` the problem tab bar hands to `PageTabs`: every tab is a client
 *  link, and the editorial one asks first. */
export function ProblemTabLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children?: ReactNode;
}) {
  if (href.endsWith("/editorial")) {
    return (
      <EditorialLink href={href} className={className}>
        {children}
      </EditorialLink>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
