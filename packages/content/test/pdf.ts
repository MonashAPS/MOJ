/**
 * PDF text extraction for the tests.
 *
 * `pdf-parse`'s package entry runs a debug harness that reads a sample file from disk, so the
 * library module is imported directly.
 */

type PdfParse = (data: Buffer) => Promise<{ text: string; numpages: number }>;

let parser: PdfParse | undefined;

async function load(): Promise<PdfParse> {
  if (!parser) {
    const module = await import("pdf-parse/lib/pdf-parse.js");
    parser = (module.default ?? module) as unknown as PdfParse;
  }
  return parser;
}

/** All the text in a PDF, with the ligature-free spellings Typst's fonts produce. */
export async function pdfText(pdf: Buffer): Promise<string> {
  const parse = await load();
  const { text } = await parse(pdf);
  return text.replace(/­/g, "").replace(/\s+/g, " ");
}

export async function pdfPages(pdf: Buffer): Promise<number> {
  const parse = await load();
  return (await parse(pdf)).numpages;
}
