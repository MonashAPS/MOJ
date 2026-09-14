"use client";

import { api } from "@convex/_generated/api";
import type { ScoreboardEventPayload } from "@convex/scoreboard";
import { Button } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import {
  ChevronLeft,
  ChevronRight,
  Keyboard,
  ListOrdered,
  Pause,
  Pencil,
  Play,
  Snowflake,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DivisionPanel } from "@/components/scoreboard/DivisionPanel";
import { EventFeed } from "@/components/scoreboard/EventFeed";
import { HallShortcuts } from "@/components/scoreboard/HallShortcuts";
import {
  type Attendance,
  contestClock,
  type DisplayRow,
  displayRows,
  nextRevealTarget,
  readSetting,
  writeSetting,
} from "@/components/scoreboard/hall";
import { type EditableBadge, TagDialog } from "@/components/scoreboard/TagDialog";
import { useAutoTour } from "@/components/scoreboard/useAutoTour";
import "@/components/scoreboard/hall.css";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/**
 * The hall scoreboard (`/scoreboard/[event]`, SPEC section 7, DESIGN.md 16.2).
 *
 * One subscription to `scoreboard.event` drives everything on screen: the grid,
 * the feed beside it and the ceremony's next target. There is no polling, and
 * the reveal is a mutation rather than local state, so every screen showing the
 * board — the projector, the stream and the organiser's laptop — turns over the
 * same result at the same moment.
 */
export function HallScoreboard({ eventKey, initial }: { eventKey: string; initial: ScoreboardEventPayload }) {
  const t = useTranslations("contests.hall");
  const live = useQuery(api.scoreboard.event, { key: eventKey });
  const payload = live === undefined ? initial : live;

  const revealStep = useMutation(api.scoreboard.revealStep);
  const revealUndo = useMutation(api.scoreboard.revealUndo);
  const revealAll = useMutation(api.scoreboard.revealAll);
  const unfreeze = useMutation(api.scoreboard.unfreeze);

  const [active, setActive] = useState(0);
  const [attendance, setAttendance] = useState<Attendance>("all");
  const [feedOpen, setFeedOpen] = useState(false);
  const [touring, setTouring] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tagRow, setTagRow] = useState<DisplayRow | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const panels = useRef<Array<HTMLDivElement | null>>([]);

  const divisions = payload?.divisions ?? [];
  const count = divisions.length;
  const index = count === 0 ? 0 : Math.min(active, count - 1);
  const division = divisions[index] ?? null;
  const hasRoster = payload?.hasRoster === true;
  const canReveal = payload?.canReveal === true;
  const canEditTags = payload?.canEditTags === true;

  /* A display box that gets restarted mid-event comes back up as it was left. */
  useEffect(() => {
    if (readSetting(`moj:scoreboard:attendance:${eventKey}`) === "in-person") setAttendance("in-person");
    if (readSetting(`moj:scoreboard:feed:${eventKey}`) === "open") setFeedOpen(true);
  }, [eventKey]);

  const chooseAttendance = useCallback(
    (next: Attendance) => {
      setAttendance(next);
      writeSetting(`moj:scoreboard:attendance:${eventKey}`, next);
    },
    [eventKey],
  );

  const chooseFeed = useCallback(
    (next: boolean) => {
      setFeedOpen(next);
      writeSetting(`moj:scoreboard:feed:${eventKey}`, next ? "open" : "closed");
    },
    [eventKey],
  );

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setActive(((next % count) + count) % count);
    },
    [count],
  );

  const rows = useMemo(() => (division ? displayRows(division, attendance) : []), [division, attendance]);
  const target = useMemo(() => nextRevealTarget(rows), [rows]);
  const entries = useQuery(api.pages.scoreboard.feed, { key: eventKey }) ?? [];

  const badges: EditableBadge[] = useMemo(() => {
    if (!payload) return [];
    const list: EditableBadge[] = payload.badges.map((badge) => ({
      ...badge,
      attendance: badge.key === payload.inPersonBadge,
    }));
    // An in-person organisation that is not also a badge never appears in a
    // row's badge list, but it still has to be editable.
    if (payload.inPersonBadge && !list.some((badge) => badge.attendance)) {
      list.push({ key: payload.inPersonBadge, label: payload.inPersonBadge, attendance: true });
    }
    return list;
  }, [payload]);

  /* The tour drives itself; a modal, the ceremony or an editing session all
     want the board to hold still. */
  const tourOn = touring && !revealing && !editing && tagRow === null && !helpOpen;
  useAutoTour({
    on: tourOn,
    restartKey: `${index}:${attendance}`,
    panel: () => panels.current[index] ?? null,
    advance: () => goTo(index + 1),
  });

  /* Keep the ceremony's next result on screen without the presenter scrolling. */
  useEffect(() => {
    if (!revealing || !target) return;
    const panel = panels.current[index];
    const row = panel?.querySelector<HTMLTableRowElement>(`tr[data-row="${target.row.participationId}"]`);
    if (!row) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
  }, [revealing, target, index]);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }, []);

  const step = useCallback(() => {
    if (!division || !target) return;
    void run(() => revealStep({ event: eventKey, contestKey: division.key }));
  }, [division, target, run, revealStep, eventKey]);

  const undo = useCallback(() => {
    if (!division) return;
    void run(() => revealUndo({ event: eventKey, contestKey: division.key }));
  }, [division, run, revealUndo, eventKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (tagRow !== null || helpOpen) return;
      if (isTypingTarget(event.target)) return;

      if (revealing) {
        if (event.key === " " || event.key === "ArrowRight" || event.key === "Enter") {
          event.preventDefault();
          step();
        } else if (event.key === "ArrowLeft" || event.key === "Backspace") {
          event.preventDefault();
          undo();
        } else if (event.key === "Escape") {
          setRevealing(false);
        }
        return;
      }

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          goTo(index + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          goTo(index - 1);
          break;
        case "?":
          event.preventDefault();
          setHelpOpen(true);
          break;
        default:
          break;
      }

      const letter = event.key.toLowerCase();
      if (letter === "p") setTouring((on) => !on);
      else if (letter === "f") chooseFeed(!feedOpen);
      else if (letter === "i" && hasRoster) {
        chooseAttendance(attendance === "all" ? "in-person" : "all");
      } else if (letter === "e" && canEditTags) setEditing((on) => !on);
      else if (letter === "r" && canReveal && target) {
        setTouring(false);
        setEditing(false);
        setRevealing(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    revealing,
    tagRow,
    helpOpen,
    index,
    goTo,
    step,
    undo,
    feedOpen,
    chooseFeed,
    attendance,
    chooseAttendance,
    hasRoster,
    canEditTags,
    canReveal,
    target,
  ]);

  if (!payload || !division) {
    return (
      <div className="hall theme-dark">
        <div className="hall-body">
          <p className="hall-empty">{t("noDivisions")}</p>
        </div>
      </div>
    );
  }

  const shown = attendance === "in-person" ? division.inPersonCount : division.rows.length;

  return (
    <div
      className="hall theme-dark"
      data-scoreboard-theme={payload.event.theme}
      data-editing={editing ? "true" : undefined}
    >
      <header className="hall-head">
        <span className="hall-title">{payload.event.name}</span>
        <span className="hall-division">{division.name}</span>
        {division.isFrozen ? (
          <span className="hall-frozen-chip">
            <Snowflake size={12} strokeWidth={2} aria-hidden />
            {t("frozenChip")}
          </span>
        ) : null}
        <span className="hall-spacer" />

        {count > 1 ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("previousDivision")}
              title={t("previousDivision")}
              onClick={() => goTo(index - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <div className="hall-tabs" role="tablist" aria-label={t("divisions")}>
              {divisions.map((entry, position) => (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  className="hall-tab"
                  aria-selected={position === index}
                  onClick={() => goTo(position)}
                >
                  {entry.name}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("nextDivision")}
              title={t("nextDivision")}
              onClick={() => goTo(index + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          icon={touring ? <Pause aria-hidden /> : <Play aria-hidden />}
          aria-pressed={touring}
          title={touring ? t("pauseTour") : t("startTour")}
          onClick={() => setTouring((on) => !on)}
        >
          {touring ? t("pause") : t("play")}
        </Button>

        {hasRoster ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<Users aria-hidden />}
            aria-pressed={attendance === "in-person"}
            title={attendance === "in-person" ? t("showingInPerson") : t("showingEveryone")}
            onClick={() => chooseAttendance(attendance === "all" ? "in-person" : "all")}
          >
            {attendance === "in-person" ? t("inPerson", { count: shown }) : t("all", { count: shown })}
          </Button>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          icon={<ListOrdered aria-hidden />}
          aria-pressed={feedOpen}
          title={t("toggleFeed")}
          onClick={() => chooseFeed(!feedOpen)}
        >
          {t("events")}
        </Button>

        {canEditTags ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil aria-hidden />}
            aria-pressed={editing}
            title={editing ? t("stopEditingBadges") : t("editBadges")}
            onClick={() => setEditing((on) => !on)}
          >
            {t("badges")}
          </Button>
        ) : null}

        {canReveal ? (
          revealing ? (
            <div className="hall-reveal-bar">
              <span className="hall-reveal-status">
                {target ? t("revealingRank", { rank: target.rank }) : t("revealComplete")}
              </span>
              <Button size="sm" disabled={!target} busy={busy} onClick={step}>
                {t("revealNext")}
              </Button>
              <Button variant="secondary" size="sm" disabled={division.revealedCount === 0} onClick={undo}>
                {t("undo")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!target}
                onClick={() => void run(() => revealAll({ event: eventKey, contestKey: division.key }))}
              >
                {t("revealAll")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                title={t("unfreezeHint")}
                onClick={() => void run(() => unfreeze({ event: eventKey, contestKey: division.key }))}
              >
                {t("unfreeze")}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setRevealing(false)}>
                {t("exit")}
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={!target}
              title={target ? t("startRevealHint") : t("nothingFrozen")}
              onClick={() => {
                setTouring(false);
                setEditing(false);
                setRevealing(true);
              }}
            >
              {t("startReveal")}
            </Button>
          )
        ) : null}

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("shortcuts")}
          title={t("shortcutsHint")}
          onClick={() => setHelpOpen(true)}
        >
          <Keyboard aria-hidden />
        </Button>
      </header>

      {division.isFrozen ? (
        <p className="hall-banner">
          <Snowflake size={14} strokeWidth={2} aria-hidden />
          {t.rich("freezeBanner", {
            time: contestClock(division.freezeOffset),
            minutes: payload.event.freezeMinutes,
            pending: division.revealPending,
            mono: (chunks) => <span className="hall-mono">{chunks}</span>,
          })}
        </p>
      ) : null}

      <div className="hall-body">
        <div className="hall-stage">
          {divisions.map((entry, position) => (
            <DivisionPanel
              key={entry.key}
              division={entry}
              rows={position === index ? rows : displayRows(entry, attendance)}
              active={position === index}
              theme={payload.event.theme}
              attendance={attendance}
              badges={payload.badges}
              inPersonBadge={payload.inPersonBadge}
              flagTemplate={payload.event.flagUrlTemplate}
              target={position === index ? target : null}
              revealing={revealing && position === index}
              canEditTags={canEditTags}
              onEditTags={setTagRow}
              panelRef={(node) => {
                panels.current[position] = node;
              }}
            />
          ))}
        </div>
        <EventFeed entries={entries} open={feedOpen} onClose={() => chooseFeed(false)} />
      </div>

      <footer className="hall-foot">
        <span className="hall-legend">
          <span className="hall-swatch" data-state="solved" />
          {t("legendSolved")}
        </span>
        <span className="hall-legend">
          <span className="hall-swatch" data-state="first" />
          {t("legendFirst")}
        </span>
        <span className="hall-legend">
          <span className="hall-swatch" data-state="frozen" />
          {t("legendFrozen")}
        </span>
        <span className="hall-legend">
          <span className="hall-swatch" data-state="judging" />
          {t("legendJudging")}
        </span>
        <span className="hall-legend">
          <span className="hall-swatch" data-state="failed" />
          {t("legendAttempted")}
        </span>
        <span className="hall-spacer" />
        {payload.warnings.length ? (
          <span className="hall-warnings">{payload.warnings.join(" · ")}</span>
        ) : null}
        <span>{t("competitors", { count: rows.length })}</span>
      </footer>

      <TagDialog
        eventKey={eventKey}
        row={tagRow}
        divisionName={division.name}
        badges={badges}
        onClose={() => setTagRow(null)}
      />
      <HallShortcuts
        open={helpOpen}
        onOpenChange={setHelpOpen}
        hasRoster={hasRoster}
        canEditTags={canEditTags}
        canReveal={canReveal}
      />
    </div>
  );
}
