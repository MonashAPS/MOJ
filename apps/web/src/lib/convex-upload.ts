import type { Id } from "@convex/_generated/dataModel";
import { readJsonBody } from "./json-body";

function isStoredFile(value: unknown): value is { storageId: Id<"_storage"> } {
  return (
    typeof value === "object" && value !== null && "storageId" in value && typeof value.storageId === "string"
  );
}

/** A POST to a Convex upload URL answers with the id of the file it stored. */
export async function readStorageId(response: Response): Promise<Id<"_storage"> | null> {
  const body = await readJsonBody(response, isStoredFile);

  return body ? body.storageId : null;
}
