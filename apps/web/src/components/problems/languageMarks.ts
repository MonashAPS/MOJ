import {
  siApachegroovy,
  siC,
  siCommonlisp,
  siCplusplus,
  siDart,
  siDotnet,
  siFortran,
  siFsharp,
  siGnubash,
  siGnuemacs,
  siGo,
  siHaskell,
  siJavascript,
  siKotlin,
  siLua,
  siOcaml,
  siPerl,
  siPhp,
  siPython,
  siRacket,
  siRuby,
  siRust,
  siScala,
  siSwift,
  siZig,
} from "simple-icons";

export type LanguageMark = { path: string; hex: string };

/**
 * A brand mark per language, where one exists.
 *
 * MOJ carries seventy runtimes and a good number of them — ALGOL 68, Intercal,
 * Sed, Turing — have never had a logo, so this is deliberately partial. The
 * picker falls back to a monogram in the language's own colour, which keeps
 * every tile the same shape whether or not anybody ever drew a mark for it.
 *
 * Keyed on `commonName`, which is what groups a language's versions together.
 */
const MARKS: Record<string, LanguageMark> = {
  Ada: { path: "", hex: "02F88C" },
  Assembly: { path: "", hex: "6E4C13" },
  Bash: { path: siGnubash.path, hex: siGnubash.hex },
  C: { path: siC.path, hex: siC.hex },
  "C#": { path: siDotnet.path, hex: "512BD4" },
  "C++": { path: siCplusplus.path, hex: siCplusplus.hex },
  D: { path: "", hex: "B03931" },
  Dart: { path: siDart.path, hex: siDart.hex },
  "F#": { path: siFsharp.path, hex: siFsharp.hex },
  Fortran: { path: siFortran.path, hex: siFortran.hex },
  Go: { path: siGo.path, hex: siGo.hex },
  Groovy: { path: siApachegroovy.path, hex: siApachegroovy.hex },
  Haskell: { path: siHaskell.path, hex: siHaskell.hex },
  JS: { path: siJavascript.path, hex: siJavascript.hex },
  JavaScript: { path: siJavascript.path, hex: siJavascript.hex },
  Java: { path: "", hex: "ED8B00" },
  Kotlin: { path: siKotlin.path, hex: siKotlin.hex },
  Lisp: { path: siCommonlisp.path, hex: siCommonlisp.hex },
  Lua: { path: siLua.path, hex: siLua.hex },
  OCaml: { path: siOcaml.path, hex: siOcaml.hex },
  ObjC: { path: "", hex: "438EFF" },
  PHP: { path: siPhp.path, hex: siPhp.hex },
  Pascal: { path: "", hex: "1E4C8A" },
  Perl: { path: siPerl.path, hex: siPerl.hex },
  Prolog: { path: "", hex: "74283C" },
  Python: { path: siPython.path, hex: siPython.hex },
  Racket: { path: siRacket.path, hex: siRacket.hex },
  Ruby: { path: siRuby.path, hex: siRuby.hex },
  Rust: { path: siRust.path, hex: "DE4A14" },
  Scala: { path: siScala.path, hex: siScala.hex },
  Scheme: { path: siGnuemacs.path, hex: "1E4AEC" },
  Swift: { path: siSwift.path, hex: siSwift.hex },
  Text: { path: "", hex: "6B7280" },
  VB: { path: siDotnet.path, hex: "512BD4" },
  Zig: { path: siZig.path, hex: siZig.hex },
};

/** Colours for the ones with no mark, so a monogram is still recognisable. */
const FALLBACK_HEX: Record<string, string> = {
  "ALGOL 68": "4B5563",
  Awk: "1E6F5C",
  "Brain****": "2F2F2F",
  COBOL: "005CA5",
  Forth: "8B0000",
  Intercal: "7C3AED",
  LLVM: "262D3A",
  Lean: "0F172A",
  Pike: "005390",
  Sed: "4B5563",
  TCL: "C3A96A",
  Turing: "A02128",
};

export function markFor(commonName: string): LanguageMark {
  const mark = MARKS[commonName];

  if (mark) return mark;

  return { path: "", hex: FALLBACK_HEX[commonName] ?? "64748B" };
}

/** Two characters that stand for the language when nothing was ever drawn. */
export function monogramFor(commonName: string): string {
  const cleaned = commonName.replace(/[^A-Za-z0-9+#]/g, "");

  if (cleaned.length <= 2) return cleaned.toUpperCase();
  const capitals = cleaned.replace(/[^A-Z]/g, "");

  if (capitals.length >= 2) return capitals.slice(0, 2);

  return cleaned.slice(0, 2).toUpperCase();
}
