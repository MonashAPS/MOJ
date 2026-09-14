"use client";

import { api } from "@convex/_generated/api";
import { sebConfigFor, sebConfigKey } from "@moj/protocol";
import { Button, Checkbox, Field, Input, Panel, Textarea, toast } from "@moj/ui";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { AdminFormError } from "@/components/admin";
import type { ContestEdit } from "./types";

/** One key per line, blanks dropped, which is how they arrive from a paste. */
function toLines(keys: string[]): string {
  return keys.join("\n");
}

function fromLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Locking a contest to Safe Exam Browser.
 *
 * The keys are saved by their own mutation rather than with the rest of the
 * contest because they live in their own table, out of reach of anything that
 * returns a contest to a browser. Holding a Config Key is enough to compute the
 * header SEB would have sent for any URL, so it is the one part of this that has
 * to stay on the server.
 */
export function ContestSebTab({ contest }: { contest: ContestEdit }) {
  const t = useTranslations("admin.contests.seb");
  const actions = useTranslations("common.actions");
  const update = useMutation(api.admin.contests.update);
  const setKeys = useMutation(api.admin.contests.setSebKeys);
  const keys = useQuery(api.admin.contests.sebKeys, { key: contest.key });

  const requiredId = useId();
  const launchId = useId();
  const configId = useId();
  const bekId = useId();

  const [required, setRequired] = useState(contest.sebRequired);
  const [launchUrl, setLaunchUrl] = useState(contest.sebLaunchUrl);
  const [configKeys, setConfigKeys] = useState("");
  const [browserExamKeys, setBrowserExamKeys] = useState("");
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setGenerated = useMutation(api.admin.contests.setSebGenerated);

  /**
   * Build the configuration MOJ will serve for this contest and record its
   * Config Key. The same pure function produces the file the route hands out,
   * so the key and the file cannot disagree.
   */
  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const configKey = await sebConfigKey(
        sebConfigFor({
          startUrl: `${origin}/contest/${contest.key}/`,
          quitUrl: `${origin}/contests/`,
        }),
      );
      await setGenerated({ key: contest.key, origin, configKey });
      toast.success(t("generated"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    } finally {
      setGenerating(false);
    }
  }

  // The keys arrive a moment after the rest of the tab; seed the boxes once.
  useEffect(() => {
    if (!keys) return;
    setConfigKeys(toLines(keys.configKeys));
    setBrowserExamKeys(toLines(keys.browserExamKeys));
  }, [keys]);

  const parsedConfigKeys = fromLines(configKeys);
  const parsedBrowserExamKeys = fromLines(browserExamKeys);
  const armed = parsedConfigKeys.length > 0 || parsedBrowserExamKeys.length > 0;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setKeys({
        key: contest.key,
        configKeys: parsedConfigKeys,
        browserExamKeys: parsedBrowserExamKeys,
      });
      await update({
        key: contest.key,
        sebRequired: required,
        sebLaunchUrl: launchUrl.trim() || null,
        reason: "Changed the Safe Exam Browser settings",
      });
      toast.success(t("saved"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("refused"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <AdminFormError message={error} />

      <Panel title={t("title")} bodyClassName="grid gap-4 p-4">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>

        <Checkbox id={requiredId} checked={required} onCheckedChange={setRequired} label={t("required")} />
        {required && !armed ? <p className="text-sm text-warning-ink">{t("noKeysWarning")}</p> : null}

        <Field label={t("launchUrl")} hint={t("launchUrlHint")} htmlFor={launchId}>
          <Input
            id={launchId}
            value={launchUrl}
            onChange={(event) => setLaunchUrl(event.target.value)}
            placeholder="sebs://judge.example.org/contest.seb"
          />
        </Field>
      </Panel>

      <Panel title={t("generate")} bodyClassName="grid gap-3 p-4">
        <p className="text-sm text-muted-foreground">{t("generateIntro")}</p>
        {keys?.generatedOrigin ? (
          <p className="text-sm text-muted-foreground">
            {t("generatedFor", { origin: keys.generatedOrigin })}{" "}
            <a href={`/contest/${contest.key}/seb-config`}>{t("downloadGenerated")}</a>
          </p>
        ) : null}
        <div>
          <Button variant="secondary" onClick={() => void generate()} busy={generating}>
            {keys?.generatedOrigin ? t("regenerate") : t("generate")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{t("generateUnverified")}</p>
      </Panel>

      <Panel title={t("keys")} bodyClassName="grid gap-4 p-4">
        <p className="text-sm text-muted-foreground">{t("keysIntro")}</p>

        <Field label={t("configKeys")} hint={t("configKeysHint")} htmlFor={configId}>
          <Textarea
            id={configId}
            rows={4}
            spellCheck={false}
            mono
            value={configKeys}
            onChange={(event) => setConfigKeys(event.target.value)}
          />
        </Field>

        <Field label={t("browserExamKeys")} hint={t("browserExamKeysHint")} htmlFor={bekId}>
          <Textarea
            id={bekId}
            rows={3}
            spellCheck={false}
            mono
            value={browserExamKeys}
            onChange={(event) => setBrowserExamKeys(event.target.value)}
          />
        </Field>
      </Panel>

      <div>
        <Button onClick={() => void save()} busy={busy}>
          {actions("save")}
        </Button>
      </div>
    </div>
  );
}
