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

/** Whether a module export is version 1's parse function. */
function isExtract(value: unknown): value is Extract {
  return typeof value === "function";
}

/** Whether a dynamic import produced a module namespace with a default export. */
function hasDefaultExport(value: unknown): value is { readonly default: unknown } {
  return typeof value === "object" && value !== null && "default" in value;
}

async function legacy(): Promise<Extract | undefined> {
  try {
    // Built at run time so no bundler resolves it statically: the path only exists in version 1.
    const specifier = ["pdf-parse", "lib", "pdf-parse.js"].join("/");
    const loaded: unknown = await import(/* @vite-ignore */ specifier);
    const parse = hasDefaultExport(loaded) ? loaded.default : loaded;

    return isExtract(parse) ? parse : undefined;
  } catch {
    return undefined;
  }
}

async function load(): Promise<Extract> {
  if (extract) return extract;

  const module = await import("pdf-parse");
  const PDFParse = module.PDFParse;

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

  const one = module.default;
  extract = isExtract(one) ? one : await legacy();

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
