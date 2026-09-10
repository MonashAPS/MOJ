import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

export type NavNode = {
  _id: Id<"navigationBar">;
  key: string;
  label: string;
  path: string;
  regex: string;
  order: number;
  children: NavNode[];
};

export const nav = query({
  args: {},
  handler: async (ctx): Promise<NavNode[]> => {
    const rows = await ctx.db.query("navigationBar").withIndex("by_order").collect();
    return buildTree(rows);
  },
});

export const miscConfig = query({
  args: {},
  handler: async (ctx): Promise<Record<string, string>> => {
    const rows = await ctx.db.query("miscConfig").collect();
    const out: Record<string, string> = {};
    for (const row of rows) out[row.key] = row.value;
    return out;
  },
});

export const flatPage = query({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    return await ctx.db
      .query("flatPages")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();
  },
});

export const flatPages = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("flatPages").collect(),
});

export const settings = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("siteSettings")
      .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
      .unique();
  },
});

export const shell = query({
  args: {},
  handler: async (ctx) => {
    const [navRows, miscRows, siteSettings] = await Promise.all([
      ctx.db.query("navigationBar").withIndex("by_order").collect(),
      ctx.db.query("miscConfig").collect(),
      ctx.db
        .query("siteSettings")
        .withIndex("by_singleton", (q) => q.eq("singleton", "site"))
        .unique(),
    ]);
    const misc: Record<string, string> = {};
    for (const row of miscRows) misc[row.key] = row.value;
    return { nav: buildTree(navRows), misc, settings: siteSettings };
  },
});

export const openOrganizations = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("organizations").collect();
    return rows
      .filter((row) => row.isOpen)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => ({ _id: row._id, name: row.name, slug: row.slug, shortName: row.shortName }));
  },
});

function buildTree(rows: Doc<"navigationBar">[]): NavNode[] {
  const nodes = new Map<string, NavNode>();
  for (const row of rows) {
    nodes.set(row._id, {
      _id: row._id,
      key: row.key,
      label: row.label,
      path: row.path,
      regex: row.regex,
      order: row.order,
      children: [],
    });
  }
  const roots: NavNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row._id);
    if (!node) continue;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: NavNode[]) => {
    list.sort((a, b) => a.order - b.order);
    for (const item of list) sort(item.children);
  };
  sort(roots);
  return roots;
}
