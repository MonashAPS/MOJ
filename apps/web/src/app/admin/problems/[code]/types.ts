import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type ProblemEdit = NonNullable<FunctionReturnType<typeof api.pages.admin.problems.edit>>;

export type ProblemOptions = FunctionReturnType<typeof api.pages.admin.problems.options>;
