import { JUDGE_LANGUAGES } from "./judgeLanguages.ts";
import type { Step } from "./types.ts";

const SHIKI_ALIASES = new Map<string, string>([
  ["c++", "cpp"],
  ["c#", "csharp"],
  ["cs", "csharp"],
  ["python3", "python"],
  ["objc", "objective-c"],
  ["objectivec", "objective-c"],
  ["objective-c++", "objective-cpp"],
  ["fortran", "fortran-free-form"],
  ["coffeescript", "coffee"],
  ["common_lisp", "lisp"],
  ["commonlisp", "lisp"],
  ["js", "javascript"],
  ["ts", "typescript"],
  ["nasm", "asm"],
  ["gas", "asm"],
  ["text", "plaintext"],
  ["turing", "plaintext"],
  ["brainfuck", "plaintext"],
  ["bf", "plaintext"],
  ["pike", "plaintext"],
  ["sed", "plaintext"],
]);

function shikiLangFor(pygments: string): string {
  const key = pygments.trim().toLowerCase();

  if (key === "") return "plaintext";

  return SHIKI_ALIASES.get(key) ?? key;
}

const languagesStep: Step = {
  table: "languages",
  sources: ["judge_language"],
  async run(ctx) {
    const emitter = ctx.emitter("languages");
    const imported = new Set<string>();

    for await (const row of ctx.rows("judge_language")) {
      ctx.report.counts("languages").read++;
      const pygments = row.s("pygments");
      const key = row.s("key");
      imported.add(key);
      await emitter.emit({
        key,
        name: row.s("name"),
        shortName: row.s("short_name"),
        commonName: row.s("common_name"),
        editorMode: row.s("ace"),
        shikiLang: shikiLangFor(pygments),
        template: row.s("template"),
        info: row.s("info"),
        description: row.s("description"),
        extension: row.s("extension"),
        legacyId: row.id(),
      });
    }

    // The source only knows the languages that site was configured with, which
    // is why the judge has been able to run Node.js and C++20 for as long as
    // nobody could pick them. Anything it did not name gets a row here.
    for (const language of JUDGE_LANGUAGES) {
      if (imported.has(language.key)) continue;
      ctx.report.counts("languages").read++;
      await emitter.emit({
        key: language.key,
        name: language.name,
        shortName: language.shortName,
        commonName: language.commonName,
        editorMode: language.editorMode,
        shikiLang: language.shikiLang,
        template: "",
        info: "",
        description: language.description ?? "",
        extension: language.extension,
      });
    }
  },
};

const problemTypesStep: Step = {
  table: "problemTypes",
  sources: ["judge_problemtype"],
  async run(ctx) {
    const emitter = ctx.emitter("problemTypes");

    for await (const row of ctx.rows("judge_problemtype")) {
      ctx.report.counts("problemTypes").read++;
      await emitter.emit({
        name: row.s("name"),
        fullName: row.s("full_name"),
        legacyId: row.id(),
      });
    }
  },
};

const problemGroupsStep: Step = {
  table: "problemGroups",
  sources: ["judge_problemgroup"],
  async run(ctx) {
    const emitter = ctx.emitter("problemGroups");

    for await (const row of ctx.rows("judge_problemgroup")) {
      ctx.report.counts("problemGroups").read++;
      await emitter.emit({
        name: row.s("name"),
        fullName: row.s("full_name"),
        legacyId: row.id(),
      });
    }
  },
};

const licensesStep: Step = {
  table: "licenses",
  sources: ["judge_license"],
  async run(ctx) {
    const emitter = ctx.emitter("licenses");

    for await (const row of ctx.rows("judge_license")) {
      ctx.report.counts("licenses").read++;
      await emitter.emit({
        key: row.s("key"),
        link: row.s("link"),
        name: row.s("name"),
        display: row.s("display"),
        icon: row.s("icon"),
        text: row.s("text"),
        legacyId: row.id(),
      });
    }
  },
};

const navigationBarStep: Step = {
  table: "navigationBar",
  sources: ["judge_navigationbar"],
  async run(ctx) {
    const emitter = ctx.emitter("navigationBar");
    const rows = await ctx.all("judge_navigationbar");
    rows.sort(
      (a, b) => a.n("level") - b.n("level") || a.n("tree_id") - b.n("tree_id") || a.n("lft") - b.n("lft"),
    );

    for (const row of rows) {
      ctx.report.counts("navigationBar").read++;
      const parentLegacy = row.nOpt("parent_id");

      if (parentLegacy !== undefined && emitter.isPending(parentLegacy)) await emitter.flush();
      await emitter.emit({
        order: row.n("order"),
        key: row.s("key"),
        label: row.s("label"),
        path: row.s("path"),
        regex: row.s("regex"),
        parentId: ctx.ref("navigationBar", parentLegacy, "judge_navigationbar", "parent_id", row.id()),
        legacyId: row.id(),
      });
    }
  },
};

const miscConfigStep: Step = {
  table: "miscConfig",
  sources: ["judge_miscconfig"],
  async run(ctx) {
    const emitter = ctx.emitter("miscConfig");

    for await (const row of ctx.rows("judge_miscconfig")) {
      ctx.report.counts("miscConfig").read++;
      await emitter.emit({
        key: row.s("key"),
        value: row.s("value"),
        legacyId: row.id(),
      });
    }
  },
};

const flatPagesStep: Step = {
  table: "flatPages",
  sources: ["django_flatpage"],
  async run(ctx) {
    const emitter = ctx.emitter("flatPages");

    for await (const row of ctx.rows("django_flatpage")) {
      ctx.report.counts("flatPages").read++;
      await emitter.emit({
        url: row.s("url"),
        title: row.s("title"),
        content: row.s("content"),
        enableComments: row.b("enable_comments"),
        legacyId: row.id(),
      });
    }
  },
};

export const siteSteps: Step[] = [languagesStep, problemTypesStep, problemGroupsStep, licensesStep];

export const siteTailSteps: Step[] = [navigationBarStep, miscConfigStep, flatPagesStep];
