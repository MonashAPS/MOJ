/**
 * PDF text extraction for the tests.
 *
 * `pdf-parse` 2 exports a `PDFParse` class; version 1 exported a function, and its package entry
 * ran a debug harness that read a sample file from disk, so that version is loaded from its
 * library module instead. Either is accepted so the tests do not pin the major version.
 */

type PdfText = { text: string; numpages: number };
type Extract = (data: Buffer) => Promise<PdfText>;

let extract: Extract | undefined;

async function legacy(): Promise<Extract | undefined> {
  try {
    // Built at run time so no bundler resolves it statically: the path only exists in version 1.
    const specifier = ["pdf-parse", "lib", "pdf-parse.js"].join("/");
    const module = (await import(/* @vite-ignore */ specifier)) as Record<string, unknown>;
    const parse = (module.default ?? module) as unknown as Extract;
    return typeof parse === "function" ? parse : undefined;
  } catch {
    return undefined;
  }
}

async function load(): Promise<Extract> {
  if (extract) return extract;

  const module = (await import("pdf-parse")) as unknown as Record<string, unknown>;
  const PDFParse = module.PDFParse as
    | (new (options: { data: Buffer }) => {
        getText(): Promise<{ text: string; pages?: unknown[]; total?: number }>;
        destroy(): Promise<void>;
      })
    | undefined;

  if (PDFParse) {
    extract = async (data: Buffer) => {
      const parser = new PDFParse({ data });
      try {
        const result = await parser.getText();
        const numpages = result.total ?? result.pages?.length ?? 0;
        return { text: result.text, numpages };
      } finally {
        await parser.destroy();
      }
    };
    return extract;
  }

  const one = (module.default ?? module) as unknown;
  extract = typeof one === "function" ? (one as Extract) : await legacy();
  if (!extract) throw new Error("pdf-parse exposes neither PDFParse nor a parse function");
  return extract;
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
