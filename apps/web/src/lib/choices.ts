import type { Id, TableNames } from "@convex/_generated/dataModel";

/**
 * A picker hands its selection back as the plain strings it was given. Looking
 * each one up among the ids that were offered keeps a document id an `Id`, and
 * drops a value the picker no longer has an option for.
 */
export function chosenIds<Table extends TableNames>(
  values: readonly string[],
  offered: readonly Id<Table>[],
): Id<Table>[] {
  const byValue = new Map<string, Id<Table>>(offered.map((id) => [id, id]));

  return values.flatMap((value) => {
    const id = byValue.get(value);

    return id === undefined ? [] : [id];
  });
}

/**
 * The same read for a single choice: a select's callback and a query string both
 * carry a bare string, and only the values the list offers are accepted.
 */
export function chosenValue<Value extends string>(
  offered: readonly { value: Value }[],
  raw: string | null | undefined,
  fallback: Value,
): Value {
  const option = offered.find((entry) => entry.value === raw);

  return option ? option.value : fallback;
}
