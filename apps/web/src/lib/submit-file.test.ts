import { describe, expect, it } from "vitest";
import { extensionOf, type FileLanguage, languageForFile, readSourceFile } from "./submit-file";

/** The shape of our own languages table where `.cpp` and `.py` collide. */
const LANGUAGES: FileLanguage[] = [
  { key: "CPP17", name: "C++17", extension: "cpp" },
  { key: "CPP20", name: "C++20", extension: "cpp" },
  { key: "CPP23", name: "C++23", extension: "cpp" },
  { key: "CLPP23", name: "C++23 (Clang)", extension: "cpp" },
  { key: "PY3", name: "Python 3", extension: "py" },
  { key: "PYPY3", name: "PyPy 3", extension: "py" },
  { key: "JAVA8", name: "Java 8", extension: "java" },
  { key: "JAVA17", name: "Java 17", extension: "java" },
  { key: "NODEJS", name: "Node.js", extension: "js" },
];

const NOTHING_HELD = { selected: "", preferred: null };

describe("extensionOf", () => {
  it("takes the last extension, lowercased", () => {
    expect(extensionOf("solution.cpp")).toBe("cpp");
    expect(extensionOf("Solution.JAVA")).toBe("java");
    expect(extensionOf("a.b.py")).toBe("py");
  });

  it("finds none where there is none", () => {
    expect(extensionOf("Makefile")).toBe("");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });
});

describe("languageForFile", () => {
  it("reads the language off the extension", () => {
    expect(languageForFile("a.js", LANGUAGES, NOTHING_HELD)).toBe("NODEJS");
  });

  it("leaves the choice alone when nothing we run claims the extension", () => {
    expect(languageForFile("notes.txt", LANGUAGES, NOTHING_HELD)).toBeNull();
    expect(languageForFile("Makefile", LANGUAGES, NOTHING_HELD)).toBeNull();
  });

  it("keeps the version already selected rather than moving it", () => {
    expect(languageForFile("a.cpp", LANGUAGES, { selected: "CPP17", preferred: null })).toBe("CPP17");
  });

  it("falls to the member's own default before guessing", () => {
    expect(languageForFile("a.cpp", LANGUAGES, { selected: "PY3", preferred: "CPP20" })).toBe("CPP20");
  });

  it("guesses the newest standard, and the plain compiler over Clang's", () => {
    expect(languageForFile("a.cpp", LANGUAGES, NOTHING_HELD)).toBe("CPP23");
  });

  it("reads a version as a number, so Java 17 beats Java 8", () => {
    expect(languageForFile("A.java", LANGUAGES, NOTHING_HELD)).toBe("JAVA17");
  });

  it("prefers the reference implementation to the alternative one", () => {
    expect(languageForFile("a.py", LANGUAGES, NOTHING_HELD)).toBe("PY3");
  });
});

describe("readSourceFile", () => {
  it("hands back the text", async () => {
    const read = await readSourceFile(new File(["print(1)\n"], "a.py"));

    expect(read).toEqual({ source: "print(1)\n" });
  });

  it("refuses a file past the source limit", async () => {
    const read = await readSourceFile(new File(["x".repeat(65_537)], "a.py"));

    expect(read).toEqual({ problem: "tooLong" });
  });

  it("refuses a binary picked by mistake", async () => {
    const read = await readSourceFile(
      new File([new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01])], "a.out"),
    );

    expect(read).toEqual({ problem: "notText" });
  });
});
