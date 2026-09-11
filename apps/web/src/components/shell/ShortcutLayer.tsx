"use client";

import { Dialog, DialogContent, Kbd, KbdGroup } from "@moj/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** DESIGN.md section 17.3. Every row here works; nothing is listed that does not. */
const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Ctrl", "K"], label: "Open the command palette" },
  { keys: ["/"], label: "Open the command palette" },
  { keys: ["g", "p"], label: "Go to problems" },
  { keys: ["g", "s"], label: "Go to submissions" },
  { keys: ["g", "c"], label: "Go to contests" },
  { keys: ["g", "u"], label: "Go to users" },
  { keys: ["g", "h"], label: "Go home" },
  { keys: ["j"], label: "Move the row cursor down" },
  { keys: ["k"], label: "Move the row cursor up" },
  { keys: ["Enter"], label: "Open the focused row" },
  { keys: ["Ctrl", "Enter"], label: "Submit, from the submit form" },
  { keys: ["r"], label: "Refetch a live list" },
  { keys: ["?"], label: "This sheet" },
  { keys: ["Esc"], label: "Close the topmost overlay" },
];

const GO_TO: Record<string, string> = {
  p: "/problems/",
  s: "/submissions/",
  c: "/contests/",
  u: "/users/",
  h: "/",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** `?` opens the sheet; `g` then a letter navigates. Both are ignored while a
 *  text field has focus, and the `g` prefix expires after a second. */
export function ShortcutLayer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const pending = useRef<number>(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "?") {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (event.key === "g") {
        pending.current = Date.now();
        return;
      }

      if (Date.now() - pending.current < 1000) {
        const target = GO_TO[event.key.toLowerCase()];
        if (target) {
          event.preventDefault();
          pending.current = 0;
          setOpen(false);
          router.push(target);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Keyboard shortcuts"
        description="Anything typed into a text field is left alone."
        width={620}
      >
        <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={`${shortcut.keys.join("+")}-${shortcut.label}`}
              className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <dt className="text-base text-subtle">{shortcut.label}</dt>
              <dd>
                <KbdGroup>
                  {shortcut.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </KbdGroup>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
