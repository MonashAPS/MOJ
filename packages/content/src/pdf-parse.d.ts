/**
 * `pdf-parse` 1 ships no types; version 2 ships its own. This fills in for the older layout, and
 * the helper narrows whatever it gets at runtime.
 */
declare module "pdf-parse" {
  const module: Record<string, unknown>;
  export = module;
}
