"use client";

import { Dialog, DialogContent, Kbd, KbdGroup } from "@moj/ui";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

/** DESIGN.md section 17.3. Every row here works; nothing is listed that does not.
 *  The key caps are literal, so only the description is a message. */
const SHORTCUTS: Array<{ keys: string[]; message: string }> = [
  { keys: ["Ctrl", "K"], message: "palette" },
  { keys: ["/"], message: "palette" },
  { keys: ["g", "p"], message: "goProblems" },
  { keys: ["g", "s"], message: "goSubmissions" },
  { keys: ["g", "c"], message: "goContests" },
  { keys: ["g", "u"], message: "goUsers" },
  { keys: ["g", "h"], message: "goHome" },
  { keys: ["j"], message: "rowDown" },
  { keys: ["k"], message: "rowUp" },
  { keys: ["Enter"], message: "openRow" },
  { keys: ["Ctrl", "Enter"], message: "submitForm" },
  { keys: ["r"], message: "refetch" },
  { keys: ["?"], message: "sheet" },
  { keys: ["Esc"], message: "closeOverlay" },
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
  const t = useTranslations("common.shortcuts");
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
      <DialogContent title={t("title")} description={t("description")} width={620}>
        <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {SHORTCUTS.map((shortcut) => (
            <div
              key={`${shortcut.keys.join("+")}-${shortcut.message}`}
              className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0 sm:[&:nth-last-child(2)]:border-b-0"
            >
              <dt className="text-base text-subtle">{t(shortcut.message)}</dt>
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
