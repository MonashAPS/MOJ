/**
 * `pdf-parse` 1 ships no types, and its library module is loaded directly because the package
 * entry runs a debug harness. Version 2 ships its own types, so these declarations only fill in
 * for the older layout; the helper narrows whatever it gets at runtime.
 */
declare module "pdf-parse/lib/pdf-parse.js" {
  const parse: (data: Buffer) => Promise<{ text: string; numpages: number }>;
  export default parse;
}

declare module "pdf-parse" {
  const module: Record<string, unknown>;
  export = module;
}
