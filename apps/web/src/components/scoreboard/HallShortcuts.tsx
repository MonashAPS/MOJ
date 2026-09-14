"use client";

import { Dialog, DialogContent, Kbd, KbdGroup } from "@moj/ui";
import { useTranslations } from "next-intl";

/** `label` is a key under `contests.hall.keys`; the key caps themselves are what
 *  is printed on the keyboard and stay as they are. */
type Shortcut = { keys: string[]; label: string };

const BASE: Shortcut[] = [
  { keys: ["←", "→"], label: "divisions" },
  { keys: ["P"], label: "tour" },
  { keys: ["F"], label: "feed" },
  { keys: ["?"], label: "sheet" },
];

const ROSTER: Shortcut[] = [{ keys: ["I"], label: "roster" }];

const TAGS: Shortcut[] = [{ keys: ["E"], label: "tags" }];

const REVEAL: Shortcut[] = [
  { keys: ["R"], label: "revealEnter" },
  { keys: ["Space"], label: "revealNext" },
  { keys: ["←"], label: "revealUndo" },
  { keys: ["Esc"], label: "revealLeave" },
];

/** DESIGN.md section 16.2: a `?` overlay lists the keys, and everything it lists works. */
export function HallShortcuts({
  open,
  onOpenChange,
  hasRoster,
  canEditTags,
  canReveal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasRoster: boolean;
  canEditTags: boolean;
  canReveal: boolean;
}) {
  const t = useTranslations("contests.hall");
  const keys = useTranslations("contests.hall.keys");
  const shortcuts = [
    ...BASE,
    ...(hasRoster ? ROSTER : []),
    ...(canEditTags ? TAGS : []),
    ...(canReveal ? REVEAL : []),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The dialog portals to the body, outside the hall's own scope, so it
          carries the dark palette itself. */}
      <DialogContent className="theme-dark" title={t("shortcuts")} width={520}>
        <dl className="grid gap-y-1">
          {shortcuts.map((shortcut) => (
            <div
              key={`${shortcut.keys.join("+")}-${shortcut.label}`}
              className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
            >
              <dt className="text-base text-subtle">{keys(shortcut.label)}</dt>
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
