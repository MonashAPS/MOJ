import type { FunctionReference } from "convex/server";
import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { BATCH_SIZE } from "./context.ts";
import {
  type ClearResult,
  type ConvexClientLike,
  ConvexLoader,
  type DocPatch,
  type ImportDoc,
  type InsertedId,
  type MappingPage,
} from "./loader.ts";
import { runPipeline, type StateFile } from "./pipeline.ts";
import { makeFixtureContext } from "./test.fixtures.ts";

/** The arguments of the four importer functions the loader calls, in one record. */
interface ImporterArgs {
  table: string;
  docs?: ImportDoc[];
  patches?: DocPatch[];
  limit?: number;
  cursor?: string | null;
  numItems?: number;
}

type ImporterResult = InsertedId[] | number | ClearResult | MappingPage;

interface Call {
  name: string;
  args: ImporterArgs;
}

/** Stands in for ConvexHttpClient so the loader can be tested without a backend. */
class FakeConvexClient implements ConvexClientLike {
  readonly calls: Call[] = [];
  readonly rows = new Map<string, InsertedId[]>();
  private counter = 0;

  private record(name: string, args: ImporterArgs): Call {
    const call = { name, args };
    this.calls.push(call);

    return call;
  }

  async mutation(reference: FunctionReference<"mutation">, args: ImporterArgs): Promise<ImporterResult> {
    const call = this.record(getFunctionName(reference), args);
    const { table } = call.args;

    if (call.name === "importer:insertBatch") {
      const docs = call.args.docs ?? [];

      const inserted: InsertedId[] = docs.map((doc) => ({
        legacyId: doc.legacyId ?? null,
        id: `id_${++this.counter}`,
      }));

      this.rows.set(table, [...(this.rows.get(table) ?? []), ...inserted]);

      return inserted;
    }

    if (call.name === "importer:patchBatch") {
      return (call.args.patches ?? []).length;
    }

    if (call.name === "importer:clearTable") {
      const remaining = this.rows.get(table) ?? [];
      const limit = call.args.limit ?? 2000;
      const deleted = remaining.splice(0, limit).length;
      this.rows.set(table, remaining);

      return { deleted, isDone: remaining.length === 0 };
    }

    throw new Error(`unexpected mutation ${call.name}`);
  }

  async query(reference: FunctionReference<"query">, args: ImporterArgs): Promise<ImporterResult> {
    const call = this.record(getFunctionName(reference), args);
    const { table } = call.args;

    if (call.name !== "importer:mapping") throw new Error(`unexpected query ${call.name}`);
    const all = this.rows.get(table) ?? [];
    const cursor = call.args.cursor ?? null;
    const start = cursor === null ? 0 : Number(cursor);
    const numItems = 2;
    const page = all.slice(start, start + numItems);
    const next = start + page.length;
    const isDone = next >= all.length;

    return { page, continueCursor: isDone ? null : String(next), isDone };
  }
}

describe("ConvexLoader", () => {
  it("calls the internal functions by name", async () => {
    const client = new FakeConvexClient();
    const loader = new ConvexLoader(client);
    await loader.insert("languages", [{ legacyId: 1 }]);
    await loader.patch("profiles", [{ id: "id_1", fields: { a: 1 } }]);
    await loader.mapping("languages");
    expect(client.calls.map((call) => call.name)).toEqual([
      "importer:insertBatch",
      "importer:patchBatch",
      "importer:mapping",
    ]);
  });

  it("returns the ids the mutation reports", async () => {
    const client = new FakeConvexClient();
    const loader = new ConvexLoader(client);
    const result = await loader.insert("problems", [{ legacyId: 7 }, { name: "no legacy id" }]);
    expect(result).toEqual([
      { legacyId: 7, id: "id_1" },
      { legacyId: null, id: "id_2" },
    ]);
  });

  it("clears a table in a loop until the mutation says it is done", async () => {
    const client = new FakeConvexClient();
    const loader = new ConvexLoader(client);
    await loader.insert(
      "submissions",
      Array.from({ length: 5 }, (_, i) => ({ legacyId: i })),
    );
    client.calls.length = 0;
    const deleted = await loader.clear("submissions");
    expect(deleted).toBe(5);
    expect(client.calls.filter((call) => call.name === "importer:clearTable").length).toBe(1);
  });

  it("pages through the mapping query", async () => {
    const client = new FakeConvexClient();
    const loader = new ConvexLoader(client);
    await loader.insert(
      "problems",
      Array.from({ length: 5 }, (_, i) => ({ legacyId: i + 1 })),
    );
    const mapping = await loader.mapping("problems");
    expect(mapping.map((entry) => entry.legacyId)).toEqual([1, 2, 3, 4, 5]);
    expect(client.calls.filter((call) => call.name === "importer:mapping").length).toBe(3);
  });
});

describe("pipeline against a fake Convex", () => {
  it("inserts in batches of 200 and resolves references from the returned ids", async () => {
    const client = new FakeConvexClient();
    const loader = new ConvexLoader(client);
    const fixture = await makeFixtureContext(loader);
    const state: StateFile = { mode: "load", dump: "fixture", startedAt: "", finished: {} };
    await runPipeline(fixture.ctx, state, { resume: false, log: () => {} });
    await fixture.ctx.closeEmitters();

    const inserts = client.calls.filter((call) => call.name === "importer:insertBatch");
    expect(inserts.length).toBeGreaterThan(0);

    for (const call of inserts) {
      const docs = call.args.docs ?? [];
      expect(docs.length).toBeGreaterThan(0);
      expect(docs.length).toBeLessThanOrEqual(BATCH_SIZE);
    }

    const problemInsert = inserts.find((call) => call.args.table === "problems");
    const problems = problemInsert?.args.docs ?? [];
    expect(problems[0]?.groupId).toBe(fixture.ctx.ids.get("problemGroups", 1));

    // The deferred profile pointer is patched once every table is in.
    const patches = client.calls.filter((call) => call.name === "importer:patchBatch");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.args.table).toBe("profiles");
    const patchList = patches[0]?.args.patches ?? [];
    expect(patchList[0]?.fields).toEqual({
      currentParticipationId: fixture.ctx.ids.get("contestParticipations", 1),
    });
  });

  it("loads the id map from Convex for tables that are already finished", async () => {
    const client = new FakeConvexClient();
    const first = await makeFixtureContext(new ConvexLoader(client));
    const state: StateFile = { mode: "load", dump: "fixture", startedAt: "", finished: {} };
    await runPipeline(first.ctx, state, { resume: false, log: () => {} });
    await first.ctx.closeEmitters();

    const resumed = await makeFixtureContext(new ConvexLoader(client));
    client.calls.length = 0;
    await runPipeline(resumed.ctx, state, { resume: true, log: () => {} });
    await resumed.ctx.closeEmitters();

    expect(
      client.calls.every((call) => call.name === "importer:mapping" || call.name === "importer:patchBatch"),
    ).toBe(true);
    expect(resumed.ctx.ids.get("problems", 1)).toBe(first.ctx.ids.get("problems", 1));
  });
});
