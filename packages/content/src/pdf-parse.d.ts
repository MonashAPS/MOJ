/**
 * `pdf-parse` 1 ships no types; version 2 ships its own. This fills in for the older layout, and
 * the helper narrows whatever it gets at runtime.
 */
declare module "pdf-parse" {
  /** Version 2's parser class. Version 1 has none, which is what the helper checks for. */
  export const PDFParse:
    | (new (options: {
        data: Buffer;
      }) => {
        getText(): Promise<{ text: string; pages?: readonly unknown[]; total?: number }>;
        destroy(): Promise<void>;
      })
    | undefined;

  /** Version 1's export: the parse function itself, which the helper checks for. */
  const parse: unknown;

  export default parse;
}
