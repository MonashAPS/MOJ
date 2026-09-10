"use client";

import { api } from "@convex/_generated/api";
import type { ScoreboardBadge } from "@convex/scoreboard";
import { Button, Checkbox, Dialog, DialogContent, DialogFooter } from "@moj/ui";
import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import type { DisplayRow } from "./hall";

export type EditableBadge = ScoreboardBadge & { attendance: boolean };

/**
 * The fork's tag editor (`live_scoreboard_tags`).
 *
 * A badge is organisation membership, so a change here is a real edit to the
 * competitor's profile and shows up everywhere on the site, not just on this
 * board. The server is the authority on what may be touched and by whom;
 * everything here is convenience on top of `scoreboard.setTag`, which takes one
 * badge at a time — so a save sends the difference, and a badge nobody touched
 * is never written back over a change another organiser made in the meantime.
 */
export function TagDialog({
  eventKey,
  row,
  divisionName,
  badges,
  onClose,
}: {
  eventKey: string;
  row: DisplayRow | null;
  divisionName: string;
  badges: EditableBadge[];
  onClose: () => void;
}) {
  const setTag = useMutation(api.scoreboard.setTag);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [initial, setInitial] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    const held: Record<string, boolean> = {};
    for (const badge of badges) {
      held[badge.key] = badge.attendance ? row.inPerson : row.badges.includes(badge.key);
    }
    setChecked(held);
    setInitial(held);
    setError(null);
    setSaving(false);
  }, [row, badges]);

  const save = async () => {
    if (!row) return;
    const changes = badges.filter((badge) => checked[badge.key] !== initial[badge.key]);
    if (changes.length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const badge of changes) {
        await setTag({
          event: eventKey,
          username: row.username,
          slug: badge.key,
          on: checked[badge.key] === true,
        });
      }
      onClose();
    } catch (failure) {
      // Stay open with the boxes as they were left, so a failed save can be
      // retried without redoing the ticking.
      setSaving(false);
      setError(failure instanceof Error ? failure.message : "The badges could not be saved.");
    }
  };

  return (
    <Dialog open={row !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      {/* Portalled to the body, outside the hall's scope: it carries the dark
          palette itself so the modal is not a white card on the projector. */}
      <DialogContent
        className="theme-dark"
        title={row?.displayName ?? "Badges"}
        description={row ? `${divisionName} · ${row.username}` : undefined}
        width={420}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !saving) {
            event.preventDefault();
            void save();
          }
        }}
      >
        {badges.length === 0 ? (
          <p className="text-base text-subtle">
            This event has no badge organisations, so there is nothing to edit. Add one to the scoreboard in
            the staff console.
          </p>
        ) : (
          <div className="grid gap-1">
            {badges.map((badge) => (
              <Checkbox
                key={badge.key}
                id={`badge-${badge.key}`}
                checked={checked[badge.key] === true}
                disabled={saving}
                onCheckedChange={(next) => setChecked((held) => ({ ...held, [badge.key]: next }))}
                label={
                  <span className="flex w-full items-center gap-2">
                    {badge.label}
                    {badge.attendance ? (
                      <span className="ml-auto text-xs uppercase tracking-label text-muted-foreground">
                        Attendance
                      </span>
                    ) : null}
                  </span>
                }
                labelClassName="w-full"
              />
            ))}
          </div>
        )}
        <DialogFooter>
          {error ? (
            <span className="mr-auto text-base text-destructive" role="alert">
              {error}
            </span>
          ) : null}
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button busy={saving} disabled={badges.length === 0} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
