/**
 * `@moj/protocol`: the wire formats MOJ speaks to things that are not the web
 * app. Pure zod, no Convex and no I/O, so both sides of a protocol can import
 * the same schema.
 */

export * from "./judge.js";
