import { getFunctionName } from "convex/server";
import { describe, expect, it } from "vitest";
import { BATCH_SIZE } from "./context.ts";
import { type ConvexClientLike, ConvexLoader, type InsertedId } from "./loader.ts";
import { runPipeline, type StateFile } from "./pipeline.ts";
import { makeFixtureContext } from "./test.fixtures.ts";

interface Call {
  name: string;
  args: Record<string, unknown>;
}

/** Stands in for ConvexHttpClient so the loader can be tested without a backend. */
class FakeConvexClient implements ConvexClientLike {
  readonly calls: Call[] = [];
  readonly rows = new Map<string, { legacyId: number | null; id: string }[]>();
  private counter = 0;

  private record(reference: unknown, args: unknown): Call {
    const call = { name: getFunctionName(reference as never), args: args as Record<string, unknown> };
    this.calls.push(call);

    return call;
  }

  async mutation(reference: unknown, args: unknown): Promise<unknown> {
    const call = this.record(reference, args);
    const table = call.args.table as string;

    if (call.name === "importer:insertBatch") {
      const docs = call.args.docs as { legacyId?: number }[];

      const inserted: InsertedId[] = docs.map((doc) => ({
        legacyId: typeof doc.legacyId === "number" ? doc.legacyId : null,
        id: `id_${++this.counter}`,
      }));

      this.rows.set(table, [...(this.rows.get(table) ?? []), ...inserted]);

      return inserted;
    }

    if (call.name === "importer:patchBatch") {
      return (call.args.patches as unknown[]).length;
    }

    if (call.name === "importer:clearTable") {
      const remaining = this.rows.get(table) ?? [];
      const limit = (call.args.limit as number) ?? 2000;
      const deleted = remaining.splice(0, limit).length;
      this.rows.set(table, remaining);

      return { deleted, isDone: remaining.length === 0 };
    }

    throw new Error(`unexpected mutation ${call.name}`);
  }

  async query(reference: unknown, args: unknown): Promise<unknown> {
    const call = this.record(reference, args);
    const table = call.args.table as string;

    if (call.name !== "importer:mapping") throw new Error(`unexpected query ${call.name}`);
    const all = this.rows.get(table) ?? [];
    const cursor = call.args.cursor as string | null;
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
      expect((call.args.docs as unknown[]).length).toBeLessThanOrEqual(BATCH_SIZE);
    }

    const problemInsert = inserts.find((call) => call.args.table === "problems");
    const problems = problemInsert?.args.docs as Record<string, unknown>[];
    expect(problems[0]?.groupId).toBe(fixture.ctx.ids.get("problemGroups", 1));

    // The deferred profile pointer is patched once every table is in.
    const patches = client.calls.filter((call) => call.name === "importer:patchBatch");
    expect(patches).toHaveLength(1);
    expect(patches[0]?.args.table).toBe("profiles");
    const patchList = patches[0]?.args.patches as { fields: Record<string, unknown> }[];
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
