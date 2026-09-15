import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ImportContext } from "./context.ts";
import { BATCH_SIZE } from "./context.ts";
import { MAP_TARGETS, STEPS, type Step } from "./steps/index.ts";

export interface StateFile {
  mode: "dry-run" | "load";
  dump: string;
  startedAt: string;
  finished: Record<string, { docs: number; at: string }>;
}

export function statePath(outDir: string): string {
  return path.join(outDir, "state.json");
}

export async function readState(outDir: string): Promise<StateFile | null> {
  try {
    return JSON.parse(await readFile(statePath(outDir), "utf8")) as StateFile;
  } catch {
    return null;
  }
}

export async function writeState(outDir: string, state: StateFile): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(statePath(outDir), `${JSON.stringify(state, null, 2)}\n`);
}

export interface PipelineOptions {
  resume: boolean;
  log: (message: string) => void;
  steps?: Step[];
}

export async function runPipeline(
  ctx: ImportContext,
  state: StateFile,
  options: PipelineOptions,
): Promise<void> {
  const steps = options.steps ?? STEPS;
  const { log } = options;

  for (const step of steps) {
    const counts = ctx.report.counts(step.table);
    counts.sources = step.sources;

    const finished = options.resume && state.finished[step.table] !== undefined;
    const selected = ctx.selected(step.table);

    if (finished || !selected) {
      if (MAP_TARGETS.has(step.table)) {
        const mapping = await ctx.loader.mapping(step.table);

        for (const entry of mapping) {
          if (entry.legacyId !== null) ctx.ids.set(step.table, entry.legacyId, entry.id);
        }

        log(
          `${step.table}: ${finished ? "already done" : "not selected"}, ${mapping.length} ids loaded from ${ctx.loader.name}`,
        );
      } else {
        log(`${step.table}: ${finished ? "already done" : "not selected"}, skipped`);
      }

      continue;
    }

    if (ctx.options.clear) await ctx.loader.clear(step.table);
    const started = Date.now();
    await step.run(ctx);
    await ctx.closeEmitter(step.table);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    log(
      `${step.table}: read ${counts.read}, wrote ${counts.written}, skipped ${counts.skipped} (${elapsed}s)`,
    );
    state.finished[step.table] = { docs: counts.written, at: new Date().toISOString() };
    await writeState(ctx.options.outDir, state);
  }

  await patchProfileParticipations(ctx, options.log);
}

async function patchProfileParticipations(ctx: ImportContext, log: (message: string) => void): Promise<void> {
  if (!ctx.selected("profiles")) return;
  const patches: { id: string; fields: Record<string, unknown> }[] = [];

  for await (const row of ctx.rows("judge_profile")) {
    const participationLegacyId = row.nOpt("current_contest_id");

    if (participationLegacyId === undefined) continue;
    const profileId = ctx.ids.get("profiles", row.id());

    if (!profileId) continue;
    const participationId = ctx.ids.get("contestParticipations", participationLegacyId);

    if (!participationId) {
      ctx.report.unresolvedRef("judge_profile", "current_contest_id", "contestParticipations", row.id());
      continue;
    }

    patches.push({ id: profileId, fields: { currentParticipationId: participationId } });
  }

  if (patches.length === 0) return;

  for (let i = 0; i < patches.length; i += BATCH_SIZE) {
    await ctx.loader.patch("profiles", patches.slice(i, i + BATCH_SIZE));
  }

  log(`profiles: patched ${patches.length} currentParticipationId references`);
}
