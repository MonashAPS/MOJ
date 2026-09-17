/**
 * Submitting a file instead of typing into the editor.
 *
 * DOMjudge takes the file you hand it, reads the language off the extension and
 * leaves the version to a selector beside it. This is the same bargain: the
 * extension is a hint and never more than one, because several runtimes answer
 * to `.cpp`, so a file only ever moves the picker and the picker is always
 * still there to correct it.
 */

/** What the submit mutation caps a submission's source at. */
export const MAX_SOURCE_LENGTH = 65_536;

export type FileLanguage = {
  key: string;
  name: string;
  extension: string;
};

/** Lowercased and without the dot; empty when the name carries no extension. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");

  if (dot <= 0 || dot === fileName.length - 1) return "";

  return fileName.slice(dot + 1).toLowerCase();
}

/**
 * The newest plainest runtime among the ones sharing an extension.
 *
 * A version in the name is read as a number rather than as text, so Java 17
 * comes before Java 8 rather than after it, and a name carrying a compiler in
 * brackets — "C++20 (Clang)" — loses to the one without, those being the
 * alternative toolchain rather than the house default.
 */
function byNewest(a: FileLanguage, b: FileLanguage): number {
  const bracketed = (a.name.includes("(") ? 1 : 0) - (b.name.includes("(") ? 1 : 0);

  if (bracketed !== 0) return bracketed;

  return b.name.localeCompare(a.name, "en", { numeric: true });
}

/**
 * Which language a file of this name should be submitted as, or null when
 * nothing we can run claims the extension and the choice stays where it was.
 *
 * Ties are the normal case rather than the exception, and the writer's own
 * answer settles them: whatever is already selected wins, then their default
 * language, and only failing both does the extension pick for them.
 */
export function languageForFile(
  fileName: string,
  languages: readonly FileLanguage[],
  held: { selected: string; preferred: string | null },
): string | null {
  const extension = extensionOf(fileName);

  if (extension === "") return null;

  const candidates = languages.filter((row) => row.extension.toLowerCase() === extension);

  if (candidates.length === 0) return null;

  if (candidates.some((row) => row.key === held.selected)) return held.selected;

  const preferred = candidates.find((row) => row.key === held.preferred);

  if (preferred) return preferred.key;

  return [...candidates].sort(byNewest)[0]?.key ?? null;
}

/** What is wrong with a file, for the form to say in the reader's language. */
type SourceFileProblem = "tooLong" | "notText";

export type SourceFileRead = { source: string } | { problem: SourceFileProblem };

/** How far in to look for the NUL byte that gives a binary away. */
const BINARY_SNIFF = 4096;

/** No source file in any language we run carries a NUL byte; a binary does. */
function looksBinary(source: string): boolean {
  const limit = Math.min(source.length, BINARY_SNIFF);

  for (let at = 0; at < limit; at += 1) {
    if (source.charCodeAt(at) === 0) return true;
  }

  return false;
}

/**
 * A source file as text.
 *
 * The two refusals are the ones that would otherwise reach the judge as
 * nonsense: a file past the source limit, and a binary picked by mistake.
 */
export async function readSourceFile(file: File): Promise<SourceFileRead> {
  if (file.size > MAX_SOURCE_LENGTH) return { problem: "tooLong" };

  const source = await file.text();

  if (source.length > MAX_SOURCE_LENGTH) return { problem: "tooLong" };

  if (looksBinary(source)) return { problem: "notText" };

  return { source };
}
