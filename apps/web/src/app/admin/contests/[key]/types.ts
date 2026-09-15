import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type ContestEdit = NonNullable<FunctionReturnType<typeof api.pages.admin.contests.edit>>;
export type ContestOptions = FunctionReturnType<typeof api.pages.admin.contests.options>;
