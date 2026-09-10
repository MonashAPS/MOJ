"use client";

import { Dialog, DialogContent, Kbd, KbdGroup } from "@moj/ui";

type Shortcut = { keys: string[]; label: string };

const BASE: Shortcut[] = [
  { keys: ["←", "→"], label: "Previous or next division" },
  { keys: ["P"], label: "Start or pause the auto-preview tour" },
  { keys: ["F"], label: "Show or hide the event feed" },
  { keys: ["?"], label: "This sheet" },
];

const ROSTER: Shortcut[] = [{ keys: ["I"], label: "Show everyone, or only the hall" }];

const TAGS: Shortcut[] = [{ keys: ["E"], label: "Edit competitor badges" }];

const REVEAL: Shortcut[] = [
  { keys: ["R"], label: "Enter the reveal" },
  { keys: ["Space"], label: "Reveal the next result" },
  { keys: ["←"], label: "Undo the last reveal" },
  { keys: ["Esc"], label: "Leave the reveal" },
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
      <DialogContent className="theme-dark" title="Keyboard shortcuts" width={520}>
        <dl className="grid gap-y-1">
          {shortcuts.map((shortcut) => (
            <div
              key={`${shortcut.keys.join("+")}-${shortcut.label}`}
              className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
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
