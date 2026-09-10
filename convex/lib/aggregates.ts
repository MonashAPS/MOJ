import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";

export const profilesByPP = new TableAggregate<{
  Namespace: boolean;
  Key: number;
  DataModel: DataModel;
  TableName: "profiles";
}>(components.profilesByPP, {
  namespace: (doc) => doc.isUnlisted,
  sortKey: (doc) => doc.performancePoints,
});

export const profilesByRating = new TableAggregate<{
  Namespace: boolean;
  Key: number;
  DataModel: DataModel;
  TableName: "profiles";
}>(components.profilesByRating, {
  namespace: (doc) => doc.isUnlisted,
  sortKey: (doc) => doc.rating ?? -1,
});

export const profilesByProblemCount = new TableAggregate<{
  Namespace: boolean;
  Key: number;
  DataModel: DataModel;
  TableName: "profiles";
}>(components.profilesByProblemCount, {
  namespace: (doc) => doc.isUnlisted,
  sortKey: (doc) => doc.problemCount,
});
