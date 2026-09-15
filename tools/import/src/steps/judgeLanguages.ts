/**
 * Languages the judge can run that the old site never had a row for.
 *
 * The import mirrors `judge_language`, so the site inherits exactly the
 * languages DMOJ was configured with years ago — C++14 but not C++20, the V8
 * fork but not Node.js. The executors have been in the judge the whole time;
 * nothing was offering them.
 *
 * Every entry here names an executor that ships in `apps/judge/judge-server`
 * and whose runtime is installed in our judge image. A key that the source
 * database already provides is left alone, so this only ever fills gaps.
 */

export type JudgeLanguage = {
  /** The executor's module name. DMOJ matches a submission to an executor by
   *  this, so it is the one field that cannot be chosen freely. */
  key: string;
  name: string;
  shortName: string;
  commonName: string;
  /** Ace mode, as the old table spelled it. */
  editorMode: string;
  shikiLang: string;
  extension: string;
  description?: string;
};

export const JUDGE_LANGUAGES: JudgeLanguage[] = [
  {
    key: "NODEJS",
    name: "Node.js",
    shortName: "Node",
    commonName: "JavaScript",
    editorMode: "javascript",
    shikiLang: "javascript",
    extension: "js",
    description:
      "Node.js, with the standard library and the usual `process.stdin` / `console.log`. " +
      "Unlike the V8 runtime beside it, a solution written here runs the same way on your own machine.",
  },
  {
    key: "C11",
    name: "C11",
    shortName: "C11",
    commonName: "C",
    editorMode: "c_cpp",
    shikiLang: "c",
    extension: "c",
  },
  {
    key: "C23",
    name: "C23",
    shortName: "C23",
    commonName: "C",
    editorMode: "c_cpp",
    shikiLang: "c",
    extension: "c",
  },
  {
    key: "CPP17",
    name: "C++17",
    shortName: "C++17",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    extension: "cpp",
  },
  {
    key: "CPP20",
    name: "C++20",
    shortName: "C++20",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    extension: "cpp",
  },
  {
    key: "CPP23",
    name: "C++23",
    shortName: "C++23",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    extension: "cpp",
  },
  {
    key: "CLPP17",
    name: "C++17 (Clang)",
    shortName: "CLang++17",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    extension: "cpp",
  },
  {
    key: "CLPP20",
    name: "C++20 (Clang)",
    shortName: "CLang++20",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    extension: "cpp",
  },
  {
    key: "CLPP23",
    name: "C++23 (Clang)",
    shortName: "CLang++23",
    commonName: "C++",
    editorMode: "c_cpp",
    shikiLang: "cpp",
    extension: "cpp",
  },
  {
    key: "JAVA",
    name: "Java",
    shortName: "Java",
    commonName: "Java",
    editorMode: "java",
    shikiLang: "java",
    extension: "java",
  },
  {
    key: "KOTLIN",
    name: "Kotlin",
    shortName: "Kotlin",
    commonName: "Kotlin",
    editorMode: "kotlin",
    shikiLang: "kotlin",
    extension: "kt",
  },
  {
    key: "GROOVY",
    name: "Groovy",
    shortName: "Groovy",
    commonName: "Groovy",
    editorMode: "groovy",
    shikiLang: "groovy",
    extension: "groovy",
  },
  {
    key: "PY2",
    name: "Python 2",
    shortName: "PY2",
    commonName: "Python",
    editorMode: "python",
    shikiLang: "python",
    extension: "py",
  },
  {
    key: "RKT",
    name: "Racket",
    shortName: "Racket",
    commonName: "Racket",
    editorMode: "scheme",
    shikiLang: "racket",
    extension: "rkt",
  },
  {
    key: "SBCL",
    name: "Common Lisp",
    shortName: "Lisp",
    commonName: "Common Lisp",
    editorMode: "lisp",
    shikiLang: "lisp",
    extension: "cl",
  },
  {
    key: "PIKE",
    name: "Pike",
    shortName: "Pike",
    commonName: "Pike",
    editorMode: "text",
    shikiLang: "plaintext",
    extension: "pike",
  },
  {
    key: "SED",
    name: "sed",
    shortName: "sed",
    commonName: "sed",
    editorMode: "text",
    shikiLang: "plaintext",
    extension: "sed",
  },
  {
    key: "BASH",
    name: "Bash",
    shortName: "Bash",
    commonName: "Bash",
    editorMode: "sh",
    shikiLang: "bash",
    extension: "sh",
  },
  {
    key: "NASM64",
    name: "Assembly (x64)",
    shortName: "NASM64",
    commonName: "Assembly",
    editorMode: "assembly_x86",
    shikiLang: "asm",
    extension: "asm",
  },
  {
    key: "GAS64",
    name: "Assembly (GAS x64)",
    shortName: "GAS64",
    commonName: "Assembly",
    editorMode: "assembly_x86",
    shikiLang: "asm",
    extension: "asm",
  },
  {
    key: "LEAN4",
    name: "Lean 4",
    shortName: "Lean",
    commonName: "Lean",
    editorMode: "text",
    shikiLang: "lean",
    extension: "lean",
  },
];
